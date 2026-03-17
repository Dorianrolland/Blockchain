// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ChainTicketFactoryV2 is AccessControl {
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");

    struct EventDeployment {
        string eventId;
        string name;
        string symbol;
        string artistId;
        string seriesId;
        uint256 primaryPrice;
        uint256 maxSupply;
        uint256 fanPassAllocationBps;
        uint256 artistRoyaltyBps;
        address treasury;
        address admin;
        address ticketNFT;
        address marketplace;
        address checkInRegistry;
        address collectibleContract;
        address fanScoreRegistry;
        address fanFuelBank;
        address insurancePool;
        address oracleAdapter;
        address merchStore;
        address perkManager;
        uint256 deploymentBlock;
        uint256 registeredAt;
    }

    struct RegisterEventParams {
        string eventId;
        string name;
        string symbol;
        string artistId;
        string seriesId;
        uint256 primaryPrice;
        uint256 maxSupply;
        uint256 fanPassAllocationBps;
        uint256 artistRoyaltyBps;
        address treasury;
        address admin;
        address ticketNFT;
        address marketplace;
        address checkInRegistry;
        address collectibleContract;
        address fanScoreRegistry;
        address fanFuelBank;
        address insurancePool;
        address oracleAdapter;
        address merchStore;
        address perkManager;
        uint256 deploymentBlock;
    }

    string[] private _eventIds;
    mapping(bytes32 eventKey => EventDeployment) private _eventsByKey;

    event EventRegistered(
        bytes32 indexed eventKey,
        string eventId,
        string artistId,
        address indexed admin,
        address indexed ticketNFT,
        address marketplace,
        address checkInRegistry
    );

    constructor(address initialAdmin_) {
        require(initialAdmin_ != address(0), "Admin is zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(CREATOR_ROLE, initialAdmin_);
    }

    function registerEvent(
        RegisterEventParams calldata params
    ) external onlyRole(CREATOR_ROLE) returns (EventDeployment memory deployment) {
        require(bytes(params.eventId).length > 0, "Event id required");
        require(bytes(params.name).length > 0, "Name required");
        require(bytes(params.symbol).length > 0, "Symbol required");
        require(bytes(params.artistId).length > 0, "Artist id required");
        require(params.treasury != address(0), "Treasury is zero address");
        require(params.admin != address(0), "Admin is zero address");
        require(params.ticketNFT != address(0), "TicketNFT is zero address");
        require(params.marketplace != address(0), "Marketplace is zero address");
        require(params.checkInRegistry != address(0), "CheckInRegistry is zero address");
        require(params.collectibleContract != address(0), "Collectible contract is zero address");
        require(params.fanScoreRegistry != address(0), "Score registry is zero address");
        require(params.fanFuelBank != address(0), "Fuel bank is zero address");
        require(params.insurancePool != address(0), "Insurance pool is zero address");
        require(params.oracleAdapter != address(0), "Oracle adapter is zero address");
        require(params.merchStore != address(0), "Merch store is zero address");
        require(params.perkManager != address(0), "Perk manager is zero address");

        bytes32 eventKey = keccak256(bytes(params.eventId));
        require(_eventsByKey[eventKey].ticketNFT == address(0), "Event already exists");

        deployment = EventDeployment({
            eventId: params.eventId,
            name: params.name,
            symbol: params.symbol,
            artistId: params.artistId,
            seriesId: params.seriesId,
            primaryPrice: params.primaryPrice,
            maxSupply: params.maxSupply,
            fanPassAllocationBps: params.fanPassAllocationBps,
            artistRoyaltyBps: params.artistRoyaltyBps,
            treasury: params.treasury,
            admin: params.admin,
            ticketNFT: params.ticketNFT,
            marketplace: params.marketplace,
            checkInRegistry: params.checkInRegistry,
            collectibleContract: params.collectibleContract,
            fanScoreRegistry: params.fanScoreRegistry,
            fanFuelBank: params.fanFuelBank,
            insurancePool: params.insurancePool,
            oracleAdapter: params.oracleAdapter,
            merchStore: params.merchStore,
            perkManager: params.perkManager,
            deploymentBlock: params.deploymentBlock,
            registeredAt: block.timestamp
        });

        _eventIds.push(params.eventId);
        _eventsByKey[eventKey] = deployment;

        emit EventRegistered(
            eventKey,
            params.eventId,
            params.artistId,
            params.admin,
            params.ticketNFT,
            params.marketplace,
            params.checkInRegistry
        );
    }

    function totalEvents() external view returns (uint256) {
        return _eventIds.length;
    }

    function getEventAt(uint256 index) external view returns (EventDeployment memory) {
        require(index < _eventIds.length, "Event index out of bounds");
        return _eventsByKey[keccak256(bytes(_eventIds[index]))];
    }

    function getEventById(
        string calldata eventId
    ) external view returns (EventDeployment memory) {
        EventDeployment memory deployment = _eventsByKey[keccak256(bytes(eventId))];
        require(deployment.ticketNFT != address(0), "Unknown event");
        return deployment;
    }
}
