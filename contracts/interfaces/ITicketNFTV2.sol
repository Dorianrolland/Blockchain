// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ITicketNFTV2 {
    function ownerOf(uint256 tokenId) external view returns (address);

    function getApproved(uint256 tokenId) external view returns (address);

    function isApprovedForAll(address owner, address operator) external view returns (bool);

    function safeTransferFrom(address from, address to, uint256 tokenId) external;

    function balanceOf(address owner) external view returns (uint256);

    function paused() external view returns (bool);

    function primaryPrice() external view returns (uint256);

    function maxPerWallet() external view returns (uint256);

    function isUsed(uint256 tokenId) external view returns (bool);

    function ticketClassOf(uint256 tokenId) external view returns (uint8);

    function permit(
        address spender,
        uint256 tokenId,
        uint256 deadline,
        bytes calldata signature
    ) external;

    function consumeForCheckIn(uint256 tokenId) external returns (address owner, uint8 ticketClass);

    function coverageClaimed(uint256 tokenId) external view returns (bool);

    function markCoverageClaimed(uint256 tokenId, uint64 roundId) external;
}
