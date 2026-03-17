// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {ICollectibleNFT} from "./interfaces/ICollectibleNFT.sol";
import {IFanFuelBank} from "./interfaces/IFanFuelBank.sol";
import {IFanScoreRegistry} from "./interfaces/IFanScoreRegistry.sol";
import {ITicketNFTV2} from "./interfaces/ITicketNFTV2.sol";

contract CheckInRegistryV2 is AccessControl {
    bytes32 public constant SCANNER_ADMIN_ROLE = keccak256("SCANNER_ADMIN_ROLE");
    bytes32 public constant SCANNER_ROLE = keccak256("SCANNER_ROLE");

    uint256 public constant CHECKIN_SCORE_REWARD = 40;
    uint256 public constant CHECKIN_FUEL_REWARD = 15;

    ITicketNFTV2 public immutable ticketNFT;
    ICollectibleNFT public immutable collectibleNFT;
    IFanScoreRegistry public immutable fanScoreRegistry;
    IFanFuelBank public immutable fanFuelBank;
    bytes32 public immutable artistKey;

    mapping(uint256 => bool) private _usedTickets;

    event ScannerGranted(address indexed account);
    event ScannerRevoked(address indexed account);
    event TicketMarkedUsed(uint256 indexed tokenId, address indexed scanner);
    event TicketCheckedInAndTransformed(
        uint256 indexed tokenId,
        uint256 indexed collectibleId,
        address indexed receiver,
        address scanner
    );

    constructor(
        address ticketNFT_,
        address collectibleNFT_,
        address fanScoreRegistry_,
        address fanFuelBank_,
        bytes32 artistKey_,
        address initialAdmin_
    ) {
        require(ticketNFT_ != address(0), "TicketNFT is zero address");
        require(collectibleNFT_ != address(0), "CollectibleNFT is zero address");
        require(fanScoreRegistry_ != address(0), "Score registry is zero address");
        require(fanFuelBank_ != address(0), "Fuel bank is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");

        ticketNFT = ITicketNFTV2(ticketNFT_);
        collectibleNFT = ICollectibleNFT(collectibleNFT_);
        fanScoreRegistry = IFanScoreRegistry(fanScoreRegistry_);
        fanFuelBank = IFanFuelBank(fanFuelBank_);
        artistKey = artistKey_;

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(SCANNER_ADMIN_ROLE, initialAdmin_);
        _setRoleAdmin(SCANNER_ROLE, SCANNER_ADMIN_ROLE);
    }

    function grantScanner(address account) external onlyRole(SCANNER_ADMIN_ROLE) {
        require(account != address(0), "Scanner is zero address");
        _grantRole(SCANNER_ROLE, account);
        emit ScannerGranted(account);
    }

    function revokeScanner(address account) external onlyRole(SCANNER_ADMIN_ROLE) {
        _revokeRole(SCANNER_ROLE, account);
        emit ScannerRevoked(account);
    }

    function markUsed(uint256 tokenId) external onlyRole(SCANNER_ROLE) {
        require(!ticketNFT.paused(), "System is paused");
        ticketNFT.ownerOf(tokenId);
        require(!_usedTickets[tokenId], "Ticket already used");

        _usedTickets[tokenId] = true;
        emit TicketMarkedUsed(tokenId, msg.sender);
    }

    function checkInAndTransform(
        uint256 tokenId,
        address receiver
    ) external onlyRole(SCANNER_ROLE) returns (uint256 collectibleId) {
        require(receiver != address(0), "Receiver is zero address");
        require(!ticketNFT.paused(), "System is paused");
        require(!_usedTickets[tokenId], "Ticket already used");

        address originalOwner = ticketNFT.ownerOf(tokenId);
        _usedTickets[tokenId] = true;
        emit TicketMarkedUsed(tokenId, msg.sender);

        (, uint8 ticketClass) = ticketNFT.consumeForCheckIn(tokenId);
        collectibleId = collectibleNFT.mintCollectible(receiver, originalOwner, tokenId, ticketClass);

        fanScoreRegistry.recordAttendance(receiver, artistKey, CHECKIN_SCORE_REWARD);
        fanFuelBank.reward(receiver, CHECKIN_FUEL_REWARD, keccak256("CHECK_IN"));

        emit TicketCheckedInAndTransformed(tokenId, collectibleId, receiver, msg.sender);
    }

    function isUsed(uint256 tokenId) external view returns (bool) {
        return _usedTickets[tokenId];
    }
}
