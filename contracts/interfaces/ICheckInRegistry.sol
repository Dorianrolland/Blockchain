// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ICheckInRegistry {
    function isUsed(uint256 tokenId) external view returns (bool);
    function checkInWithPermit(uint256 tokenId, uint256 deadline, bytes calldata signature) external;
    function nonces(uint256 tokenId) external view returns (uint256);
}
