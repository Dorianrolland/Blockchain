import { ethers } from "ethers";
import * as fs from "fs";

async function main() {
    console.log("🚀 Lancement du déploiement...");

    // 1. On se connecte à la blockchain locale
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const organisateur = await provider.getSigner(0);

    // 2. On lit le contrat compilé sur le disque dur
    const artifactJson = fs.readFileSync("./artifacts/contracts/ChainTicket.sol/ChainTicket.json", "utf8");
    const artifact = JSON.parse(artifactJson);

    // 3. On prépare l'usine à contrats
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, organisateur);
    
    // 4. On déploie ! (Prix : 0.1 ETH, Quantité : 100)
    const prixBillet = ethers.parseEther("0.1");
    const ticketContract = await factory.deploy(prixBillet, 100);
    
    await ticketContract.waitForDeployment();
    
    const contractAddress = await ticketContract.getAddress();
    console.log("\n✅ DÉPLOIEMENT RÉUSSI !");
    console.log("📍 ADRESSE DU CONTRAT :", contractAddress);
    console.log("\n⚠️ Garde cette adresse précieusement, on va la mettre dans notre page Web !");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});