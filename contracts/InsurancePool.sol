// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ITicketNFTV2} from "./interfaces/ITicketNFTV2.sol";

contract InsurancePool is AccessControl, ReentrancyGuard {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    struct WeatherPolicy {
        bool active;
        uint16 payoutBps;
        uint64 roundId;
        bytes32 reportHash;
    }

    ITicketNFTV2 public immutable ticketNFT;
    WeatherPolicy private _currentPolicy;
    uint256 public totalPremiumsCollected;

    mapping(uint256 tokenId => bool) private _registeredCoverage;

    event CoverageRegistered(uint256 indexed tokenId, uint256 premiumAmount);
    event WeatherPolicyActivated(uint64 indexed roundId, uint16 payoutBps, bytes32 indexed reportHash);
    event CoverageClaimed(
        uint256 indexed tokenId,
        address indexed claimant,
        uint256 payoutAmount,
        uint64 indexed roundId
    );

    constructor(address ticketNFT_, address initialAdmin_) {
        require(ticketNFT_ != address(0), "TicketNFT is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");

        ticketNFT = ITicketNFTV2(ticketNFT_);
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(ORACLE_ROLE, initialAdmin_);
    }

    function currentPolicy()
        external
        view
        returns (bool active, uint16 payoutBps, uint64 roundId, bytes32 reportHash)
    {
        WeatherPolicy memory policy = _currentPolicy;
        return (policy.active, policy.payoutBps, policy.roundId, policy.reportHash);
    }

    function registerCoverage(uint256 tokenId) external payable {
        require(msg.sender == address(ticketNFT), "Only ticket contract can register coverage");
        require(!_registeredCoverage[tokenId], "Coverage already registered");
        require(msg.value > 0, "Premium must be > 0");

        _registeredCoverage[tokenId] = true;
        totalPremiumsCollected += msg.value;
        emit CoverageRegistered(tokenId, msg.value);
    }

    function activateWeatherPolicy(
        uint64 roundId,
        uint16 payoutBps,
        bytes32 reportHash
    ) external onlyRole(ORACLE_ROLE) {
        require(roundId > _currentPolicy.roundId, "Round must increase");
        require(payoutBps <= 10_000, "Invalid payout bps");

        _currentPolicy = WeatherPolicy({
            active: true,
            payoutBps: payoutBps,
            roundId: roundId,
            reportHash: reportHash
        });

        emit WeatherPolicyActivated(roundId, payoutBps, reportHash);
    }

    function claim(uint256 tokenId) external nonReentrant returns (uint256 payoutAmount) {
        WeatherPolicy memory policy = _currentPolicy;
        require(policy.active, "No active policy");
        require(policy.payoutBps > 0, "No payout configured");
        require(_registeredCoverage[tokenId], "Coverage not registered");
        require(!ticketNFT.coverageClaimed(tokenId), "Coverage already claimed");

        address claimant = ticketNFT.ownerOf(tokenId);
        require(msg.sender == claimant, "Only ticket owner can claim");

        payoutAmount = (ticketNFT.primaryPrice() * policy.payoutBps) / 10_000;
        require(address(this).balance >= payoutAmount, "Insurance pool underfunded");

        ticketNFT.markCoverageClaimed(tokenId, policy.roundId);

        (bool paid, ) = payable(claimant).call{value: payoutAmount}("");
        require(paid, "Insurance payout failed");

        emit CoverageClaimed(tokenId, claimant, payoutAmount, policy.roundId);
    }

    receive() external payable {}
}
