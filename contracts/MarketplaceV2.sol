// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IFanFuelBank} from "./interfaces/IFanFuelBank.sol";
import {IFanScoreRegistry} from "./interfaces/IFanScoreRegistry.sol";
import {ITicketNFTV2} from "./interfaces/ITicketNFTV2.sol";

contract MarketplaceV2 is AccessControl, ReentrancyGuard {
    bytes32 public constant BUYBACK_ROLE = keccak256("BUYBACK_ROLE");

    uint256 public constant SECONDARY_PURCHASE_SCORE_REWARD = 3;
    uint256 public constant SECONDARY_PURCHASE_FUEL_REWARD = 2;
    uint256 public constant BUYBACK_SCORE_REWARD = 12;
    uint256 public constant BUYBACK_FUEL_REWARD = 8;
    uint8 private constant STANDARD_CLASS = 0;
    uint8 private constant FAN_PASS_CLASS = 1;

    ITicketNFTV2 public immutable ticketNFT;
    address public immutable treasury;
    uint256 public immutable artistRoyaltyBps;
    bytes32 public immutable artistKey;
    IFanScoreRegistry public immutable fanScoreRegistry;
    IFanFuelBank public immutable fanFuelBank;

    struct Listing {
        address seller;
        uint256 price;
    }

    mapping(uint256 tokenId => Listing) private _listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed tokenId, address indexed actor);
    event Sold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        uint256 artistRoyaltyAmount
    );
    event Buyback(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed organizer,
        uint256 price
    );

    constructor(
        address ticketNFT_,
        address treasury_,
        uint256 artistRoyaltyBps_,
        bytes32 artistKey_,
        address fanScoreRegistry_,
        address fanFuelBank_,
        address initialAdmin_
    ) {
        require(ticketNFT_ != address(0), "TicketNFT is zero address");
        require(treasury_ != address(0), "Treasury is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");
        require(artistRoyaltyBps_ <= 10_000, "Invalid royalty bps");

        ticketNFT = ITicketNFTV2(ticketNFT_);
        treasury = treasury_;
        artistRoyaltyBps = artistRoyaltyBps_;
        artistKey = artistKey_;
        fanScoreRegistry = IFanScoreRegistry(fanScoreRegistry_);
        fanFuelBank = IFanFuelBank(fanFuelBank_);

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(BUYBACK_ROLE, initialAdmin_);
    }

    function list(uint256 tokenId, uint256 price) external {
        _createListing(msg.sender, tokenId, price);
    }

    function listWithPermit(
        uint256 tokenId,
        uint256 price,
        uint256 deadline,
        bytes calldata signature
    ) external {
        ticketNFT.permit(address(this), tokenId, deadline, signature);
        _createListing(msg.sender, tokenId, price);
    }

    function cancel(uint256 tokenId) external {
        Listing memory listing = _listings[tokenId];
        require(listing.seller != address(0), "Listing not found");
        require(
            msg.sender == listing.seller || hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not allowed to cancel"
        );

        delete _listings[tokenId];
        emit Cancelled(tokenId, msg.sender);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        require(!ticketNFT.paused(), "System is paused");

        Listing memory listing = _listings[tokenId];
        require(listing.seller != address(0), "Listing not found");
        require(ticketNFT.ticketClassOf(tokenId) == STANDARD_CLASS, "FanPass cannot be resold");
        require(!ticketNFT.isUsed(tokenId), "Used tickets cannot be sold");
        require(ticketNFT.ownerOf(tokenId) == listing.seller, "Seller no longer owner");
        require(msg.sender != listing.seller, "Seller cannot buy own ticket");
        require(msg.value == listing.price, "Incorrect payment amount");
        require(
            ticketNFT.balanceOf(msg.sender) < ticketNFT.maxPerWallet(),
            "Buyer wallet limit reached"
        );

        delete _listings[tokenId];
        ticketNFT.safeTransferFrom(listing.seller, msg.sender, tokenId);

        uint256 royaltyAmount = (msg.value * artistRoyaltyBps) / 10_000;
        uint256 sellerAmount = msg.value - royaltyAmount;

        (bool royaltyPaid, ) = payable(treasury).call{value: royaltyAmount}("");
        require(royaltyPaid, "Royalty transfer failed");

        (bool sellerPaid, ) = payable(listing.seller).call{value: sellerAmount}("");
        require(sellerPaid, "Seller transfer failed");

        if (address(fanScoreRegistry) != address(0)) {
            fanScoreRegistry.recordPurchase(msg.sender, artistKey, SECONDARY_PURCHASE_SCORE_REWARD);
        }
        if (address(fanFuelBank) != address(0)) {
            fanFuelBank.reward(
                msg.sender,
                SECONDARY_PURCHASE_FUEL_REWARD,
                keccak256("SECONDARY_PURCHASE")
            );
        }

        emit Sold(tokenId, listing.seller, msg.sender, listing.price, royaltyAmount);
    }

    function organizerBuyback(uint256 tokenId) external payable onlyRole(BUYBACK_ROLE) nonReentrant {
        require(!ticketNFT.paused(), "System is paused");
        require(ticketNFT.ticketClassOf(tokenId) == FAN_PASS_CLASS, "Buyback only for FanPass");
        require(!ticketNFT.isUsed(tokenId), "Used tickets cannot be bought back");

        address seller = ticketNFT.ownerOf(tokenId);
        require(seller != treasury, "Organizer already owns ticket");
        require(msg.value == ticketNFT.primaryPrice(), "Incorrect buyback payment");

        bool approvedForToken = ticketNFT.getApproved(tokenId) == address(this);
        bool approvedForAll = ticketNFT.isApprovedForAll(seller, address(this));
        require(approvedForToken || approvedForAll, "Marketplace not approved");

        ticketNFT.safeTransferFrom(seller, treasury, tokenId);

        (bool sellerPaid, ) = payable(seller).call{value: msg.value}("");
        require(sellerPaid, "Seller transfer failed");

        if (address(fanScoreRegistry) != address(0)) {
            fanScoreRegistry.recordBuyback(seller, artistKey, BUYBACK_SCORE_REWARD);
        }
        if (address(fanFuelBank) != address(0)) {
            fanFuelBank.reward(seller, BUYBACK_FUEL_REWARD, keccak256("ORGANIZER_BUYBACK"));
        }

        emit Buyback(tokenId, seller, msg.sender, msg.value);
    }

    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }

    function _createListing(address seller, uint256 tokenId, uint256 price) private {
        require(!ticketNFT.paused(), "System is paused");
        require(ticketNFT.ticketClassOf(tokenId) == STANDARD_CLASS, "FanPass cannot be listed");
        require(price > 0, "Price must be > 0");
        require(price <= ticketNFT.primaryPrice(), "Price exceeds primary cap");
        require(!ticketNFT.isUsed(tokenId), "Used tickets cannot be listed");
        require(ticketNFT.ownerOf(tokenId) == seller, "Only owner can list");

        bool approvedForToken = ticketNFT.getApproved(tokenId) == address(this);
        bool approvedForAll = ticketNFT.isApprovedForAll(seller, address(this));
        require(approvedForToken || approvedForAll, "Marketplace not approved");

        _listings[tokenId] = Listing({seller: seller, price: price});
        emit Listed(tokenId, seller, price);
    }
}
