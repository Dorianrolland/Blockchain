// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IFanScoreRegistry {
    function reputationOf(address fan) external view returns (uint256);

    function artistAttendanceOf(address fan, bytes32 artistKey) external view returns (uint256);

    function tierOf(address fan) external view returns (uint8);

    function recordMint(address fan, bytes32 artistKey, uint256 scoreAmount) external;

    function recordPurchase(address fan, bytes32 artistKey, uint256 scoreAmount) external;

    function recordBuyback(address fan, bytes32 artistKey, uint256 scoreAmount) external;

    function recordAttendance(address fan, bytes32 artistKey, uint256 scoreAmount) external;
}
