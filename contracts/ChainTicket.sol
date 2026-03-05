// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract ChainTicket is ERC721, Ownable {
    uint256 private _nextTokenId;
    uint256 public ticketPrice;
    uint256 public maxSupply;
    
    // --- NOUVEAUTÉ BRIQUE 3 : SECURITE ANTI-BOT ---
    uint256 public maxTicketsPerWallet = 2; // Limite stricte de 2 billets par personne
    mapping(address => uint256) public walletPurchases; // Le registre qui compte les achats de chacun

    // --- BRIQUE 2 : LOGIQUE BUSINESS ---
    uint256 public royaltyPercentage = 5;
    struct ResaleInfo {
        bool isForSale;
        uint256 price;
    }
    mapping(uint256 => ResaleInfo) public ticketsForSale;


    constructor(uint256 _price, uint256 _maxSupply) 
        ERC721("ChainTicket Event", "CTK") 
        Ownable(msg.sender) 
    {
        ticketPrice = _price;
        maxSupply = _maxSupply;
    }

    // 1. Achat initial du billet (Marché Primaire)
    function mintTicket() public payable {
        require(msg.value >= ticketPrice, "Fonds insuffisants");
        require(_nextTokenId < maxSupply, "Desole, l'evenement est complet !");
        
        // LE MUR ANTI-BOT EST ICI :
        require(walletPurchases[msg.sender] < maxTicketsPerWallet, "Limite de billets atteinte pour ce portefeuille !");

        // On incrémente le compteur pour cette personne
        walletPurchases[msg.sender]++;

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        
        _safeMint(msg.sender, tokenId);
    }

    // 2. Mettre son billet en vente (Marché Secondaire)
    function listTicketForSale(uint256 tokenId, uint256 salePrice) public {
        require(ownerOf(tokenId) == msg.sender, "Ce n'est pas votre billet !");
        ticketsForSale[tokenId] = ResaleInfo(true, salePrice);
    }

    // 3. Acheter un billet d'occasion (Avec répartition automatique)
    function buyResaleTicket(uint256 tokenId) public payable {
        ResaleInfo memory ticketInfo = ticketsForSale[tokenId];
        
        require(ticketInfo.isForSale == true, "Ce billet n'est pas a vendre");
        require(msg.value >= ticketInfo.price, "Montant envoye insuffisant");

        address seller = ownerOf(tokenId);

        uint256 royaltyAmount = (msg.value * royaltyPercentage) / 100;
        uint256 sellerAmount = msg.value - royaltyAmount;

        ticketsForSale[tokenId] = ResaleInfo(false, 0);

        _transfer(seller, msg.sender, tokenId);

        payable(owner()).transfer(royaltyAmount);
        payable(seller).transfer(sellerAmount);
    }
}