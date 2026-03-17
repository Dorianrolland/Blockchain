// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import {InsurancePool} from "./InsurancePool.sol";

contract WeatherOracleAdapter is AccessControl {
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    InsurancePool public immutable insurancePool;

    event WeatherOutcomePublished(
        uint64 indexed roundId,
        uint16 payoutBps,
        bytes32 indexed reportHash,
        address indexed reporter
    );

    constructor(address insurancePool_, address initialAdmin_) {
        require(insurancePool_ != address(0), "Insurance pool is zero address");
        require(initialAdmin_ != address(0), "Admin is zero address");

        insurancePool = InsurancePool(payable(insurancePool_));
        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin_);
        _grantRole(REPORTER_ROLE, initialAdmin_);
    }

    function publishWeatherOutcome(
        uint64 roundId,
        uint16 payoutBps,
        bytes32 reportHash
    ) external onlyRole(REPORTER_ROLE) {
        insurancePool.activateWeatherPolicy(roundId, payoutBps, reportHash);
        emit WeatherOutcomePublished(roundId, payoutBps, reportHash, msg.sender);
    }
}
