// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract MerchTwinNFT is ERC721, AccessControl {
    using Strings for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    struct RedemptionInfo {
        string skuId;
        address redeemer;
        uint256 fuelCost;
    }

    string private _baseTokenURI;
    uint256 private _nextTwinId;

    mapping(uint256 twinId => RedemptionInfo) private _redemptions;

    event MerchTwinMinted(
        uint256 indexed twinId,
        string indexed skuId,
        address indexed redeemer,
        uint256 fuelCost
    );
    event BaseUriUpdated(string baseTokenURI);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseTokenURI_,
        address initialAdmin_
    ) ERC721(name_, symbol_) {
        require(initialAdmin_ != address(0), "Admin is zero address");
        _baseTokenURI = baseTokenURI_;
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(MINTER_ROLE, initialAdmin_);
    }

    function mintForRedemption(
        address to,
        string calldata skuId,
        uint256 fuelCost
    ) external onlyRole(MINTER_ROLE) returns (uint256 twinId) {
        require(to != address(0), "Receiver is zero address");
        twinId = _nextTwinId;
        _nextTwinId += 1;

        _redemptions[twinId] = RedemptionInfo({
            skuId: skuId,
            redeemer: to,
            fuelCost: fuelCost
        });

        _safeMint(to, twinId);
        emit MerchTwinMinted(twinId, skuId, to, fuelCost);
    }

    function redemptionInfo(
        uint256 twinId
    ) external view returns (RedemptionInfo memory) {
        _requireOwned(twinId);
        return _redemptions[twinId];
    }

    function setBaseUri(string calldata baseTokenURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseTokenURI_;
        emit BaseUriUpdated(baseTokenURI_);
    }

    function tokenURI(uint256 twinId) public view override returns (string memory) {
        _requireOwned(twinId);
        if (bytes(_baseTokenURI).length == 0) {
            return "";
        }
        return string.concat(_baseTokenURI, twinId.toString(), ".json");
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
