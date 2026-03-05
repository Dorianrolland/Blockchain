# 🎟️ ChainTicket - Billetterie Décentralisée NFT (Web3)

**ChainTicket** est un projet d'ingénierie blockchain (ING3) conçu pour sécuriser la billetterie événementielle. En s'appuyant sur les Smart Contracts, le projet résout les problèmes de fraude, de scalping et assure une redistribution automatique des revenus lors de la revente.



---

## 🌟 Fonctionnalités majeures

Le projet repose sur quatre piliers de sécurité et de gestion :

1. **Marché Primaire (NFT) :** Chaque billet est un jeton ERC-721 unique et infalsifiable.
2. **Marché Secondaire Contrôlé :** Les utilisateurs peuvent remettre leurs billets en vente directement via le Smart Contract.
3. **Royalty Automatisée :** L'organisateur perçoit une commission de **5%** sur chaque transaction du marché secondaire.
   * *Logique :* $Commission = Prix_{revente} \times 0.05$
4. **Bouclier Anti-Bot :** Une restriction logicielle empêche un portefeuille unique de détenir plus de **2 billets**, limitant ainsi l'accaparement des stocks par des robots.

---

## 🛠️ Stack Technique

* **Langage :** Solidity (v0.8.20)
* **Framework de développement :** Hardhat (v3 Beta)
* **Librairie Client :** Ethers.js (v6)
* **Portefeuille :** MetaMask
* **Interface :** HTML5 / JavaScript Vanilla
* **Réseau de test :** Hardhat Network (localhost:8545)

---

## 🚀 Installation

### 1. Prérequis
Assurez-vous d'avoir installé :
* [Node.js](https://nodejs.org/) (version 18+ recommandée)
* L'extension de navigateur [MetaMask](https://metamask.io/)

### 2. Cloner et installer
```bash
# Clone le dépôt
git clone [https://github.com/votre-compte/chainticket.git](https://github.com/votre-compte/chainticket.git)
cd chainticket

# Installe les dépendances
npm install