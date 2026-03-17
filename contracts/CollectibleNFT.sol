// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC165} from "@openzeppelin/contracts/interfaces/IERC165.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {ICollectibleNFT} from "./interfaces/ICollectibleNFT.sol";
import {IFanScoreRegistry} from "./interfaces/IFanScoreRegistry.sol";

contract CollectibleNFT is ERC721, AccessControl, IERC4906, ICollectibleNFT {
    using Strings for uint256;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    struct CollectibleInfo {
        uint256 sourceTicketId;
        address originFan;
        uint8 sourceTicketClass;
    }

    IFanScoreRegistry public immutable fanScoreRegistry;
    string public artistId;
    bytes32 public immutable artistKey;

    string private _baseTokenURI;
    uint256 private _nextCollectibleId;

    mapping(uint256 collectibleId => CollectibleInfo) private _collectibleInfo;

    event CollectibleMinted(
        uint256 indexed collectibleId,
        uint256 indexed sourceTicketId,
        address indexed originFan,
        uint8 sourceTicketClass
    );
    event BaseUriUpdated(string baseTokenURI);

    constructor(
        string memory name_,
        string memory symbol_,
        string memory artistId_,
        string memory baseTokenURI_,
        address fanScoreRegistry_,
        address initialAdmin_
    ) ERC721(name_, symbol_) {
        require(fanScoreRegistry_ != address(0), "Score registry is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");

        fanScoreRegistry = IFanScoreRegistry(fanScoreRegistry_);
        artistId = artistId_;
        artistKey = keccak256(bytes(artistId_));
        _baseTokenURI = baseTokenURI_;

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(MINTER_ROLE, initialAdmin_);
    }

    function mintCollectible(
        address to,
        address originFan,
        uint256 sourceTicketId,
        uint8 sourceTicketClass
    ) external onlyRole(MINTER_ROLE) returns (uint256 collectibleId) {
        require(to != address(0), "Receiver is zero address");
        require(originFan != address(0), "Origin fan is zero address");

        collectibleId = _nextCollectibleId;
        _nextCollectibleId += 1;

        _collectibleInfo[collectibleId] = CollectibleInfo({
            sourceTicketId: sourceTicketId,
            originFan: originFan,
            sourceTicketClass: sourceTicketClass
        });

        _safeMint(to, collectibleId);
        emit CollectibleMinted(collectibleId, sourceTicketId, originFan, sourceTicketClass);
    }

    function setBaseUri(string calldata baseTokenURI_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _baseTokenURI = baseTokenURI_;
        emit BaseUriUpdated(baseTokenURI_);

        if (_nextCollectibleId > 0) {
            emit BatchMetadataUpdate(0, _nextCollectibleId - 1);
        }
    }

    function collectibleInfo(
        uint256 collectibleId
    ) external view returns (CollectibleInfo memory) {
        _requireOwned(collectibleId);
        return _collectibleInfo[collectibleId];
    }

    function levelOf(uint256 collectibleId) public view returns (uint256) {
        _requireOwned(collectibleId);
        CollectibleInfo memory info = _collectibleInfo[collectibleId];
        return fanScoreRegistry.artistAttendanceOf(info.originFan, artistKey);
    }

    function tokenURI(uint256 collectibleId) public view override returns (string memory) {
        _requireOwned(collectibleId);
        if (bytes(_baseTokenURI).length == 0) {
            return "";
        }

        return
            string.concat(
                _baseTokenURI,
                collectibleId.toString(),
                "-level-",
                levelOf(collectibleId).toString(),
                ".json"
            );
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl, IERC165) returns (bool) {
        return
            interfaceId == type(ICollectibleNFT).interfaceId ||
            interfaceId == type(IERC4906).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
