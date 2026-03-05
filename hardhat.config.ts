import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import "@nomicfoundation/hardhat-ethers"; // <-- On force le chargement ici !

const config: HardhatUserConfig = {
  solidity: "0.8.28",
};

export default config;