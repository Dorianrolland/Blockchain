// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IInsurancePool {
    function registerCoverage(uint256 tokenId) external payable;

    function currentPolicy()
        external
        view
        returns (bool active, uint16 payoutBps, uint64 roundId, bytes32 reportHash);
}
