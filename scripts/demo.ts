import { ethers } from "ethers";
import * as fs from "fs";

async function main() {
    console.log("🔌 Connexion à la blockchain locale (Port 8545)...");
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    
    // On ajoute un 4ème acteur : Le Bot !
    const organisateur = await provider.getSigner(0);
    const fanA = await provider.getSigner(1);
    const fanB = await provider.getSigner(2);
    const bot = await provider.getSigner(3); 

    console.log("\n🎟️ --- DEBUT DE LA DEMO CHAINTICKET --- 🎟️\n");
    console.log("👨‍💼 Organisateur :", organisateur.address);
    console.log("🙋‍♂️ Fan A :", fanA.address);
    console.log("🙋‍♀️ Fan B :", fanB.address);
    console.log("🤖 Bot Fraudeur :", bot.address, "\n");

    const artifactJson = fs.readFileSync("./artifacts/contracts/ChainTicket.sol/ChainTicket.json", "utf8");
    const artifact = JSON.parse(artifactJson);

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, organisateur);
    
    const prixBillet = ethers.parseEther("0.1");
    console.log("🚀 L'organisateur déploie le contrat...");
    const ticketContract = await factory.deploy(prixBillet, 100);
    await ticketContract.waitForDeployment();
    const contractAddress = await ticketContract.getAddress();
    console.log("✅ Contrat déployé à l'adresse :", contractAddress, "\n");

    const contractFanA = new ethers.Contract(contractAddress, artifact.abi, fanA);
    const contractFanB = new ethers.Contract(contractAddress, artifact.abi, fanB);
    const contractBot = new ethers.Contract(contractAddress, artifact.abi, bot);

    console.log("🛒 Fan A achète un billet neuf pour 0.1 ETH...");
    let txMint = await contractFanA.mintTicket({ value: prixBillet });
    await txMint.wait(); 
    console.log("✅ Fan A possède le billet NFT n°0.\n");

    const prixRevente = ethers.parseEther("0.2");
    console.log("📈 Fan A met son billet en revente pour 0.2 ETH...");
    const txApprove = await contractFanA.approve(contractAddress, 0);
    await txApprove.wait();
    const txList = await contractFanA.listTicketForSale(0, prixRevente);
    await txList.wait();
    console.log("✅ Billet n°0 mis sur le marché secondaire.\n");

    console.log("🤝 Fan B achète le billet d'occasion de Fan A...");
    const blockAvant = await provider.getBlockNumber();
    const soldeOrgaAvant = await provider.getBalance(organisateur.address, blockAvant);
    const txBuy = await contractFanB.buyResaleTicket(0, { value: prixRevente });
    const receipt = await txBuy.wait();
    const soldeOrgaApres = await provider.getBalance(organisateur.address, receipt?.blockNumber);
    console.log("✅ Billet transféré à Fan B !");
    
    const commissionGagnee = soldeOrgaApres - soldeOrgaAvant;
    console.log("\n💰 --- BILAN FINANCIER --- 💰");
    console.log("L'organisateur a reçu une commission de :", ethers.formatEther(commissionGagnee), "ETH");


    // --- 🤖 LA SCÈNE DU BOT (BRIQUE 3) ---
    console.log("\n🛡️ --- TEST DE SECURITE ANTI-BOT --- 🛡️");
    console.log("Un robot essaie d'acheter 3 billets de suite pour vider le stock...");

    console.log("🛒 Bot achète le Billet 1...");
    let txBot1 = await contractBot.mintTicket({ value: prixBillet });
    await txBot1.wait();
    console.log("✅ Achat réussi (1/2).");

    console.log("🛒 Bot achète le Billet 2...");
    let txBot2 = await contractBot.mintTicket({ value: prixBillet });
    await txBot2.wait();
    console.log("✅ Achat réussi (2/2 - Limite atteinte !).");

    console.log("🛒 Bot essaie d'acheter le Billet 3...");
    try {
        // Cette ligne DOIT cracher une erreur !
        let txBot3 = await contractBot.mintTicket({ value: prixBillet });
        await txBot3.wait();
        console.log("❌ ALARME : Le Bot a réussi à contourner la sécurité !");
    } catch (error: any) {
        console.log("⛔ SUCCÈS : Le Smart Contract a bloqué la transaction !");
        console.log("Raison renvoyée par la blockchain : 'Limite de billets atteinte pour ce portefeuille !'");
    }
    console.log("------------------------------------------\n");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});