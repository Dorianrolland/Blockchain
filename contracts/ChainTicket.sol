// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChainTicket is ERC721, Ownable {
    uint256 private _nextTokenId;
    uint256 public ticketPrice;
    uint256 public maxSupply;

    // Le constructeur initialise l'événement lors du déploiement
    constructor(uint256 _price, uint256 _maxSupply) 
        ERC721("ChainTicket Event", "CTK") 
        Ownable(msg.sender) 
    {
        ticketPrice = _price;
        maxSupply = _maxSupply;
    }

    // Fonction pour qu'un fan puisse acheter son billet
    function mintTicket() public payable {
        require(msg.value >= ticketPrice, "Fonds insuffisants");
        require(_nextTokenId < maxSupply, "Desole, l'evenement est complet !");

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        
        _safeMint(msg.sender, tokenId);
    }
}