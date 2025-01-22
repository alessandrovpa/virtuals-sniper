import { ethers } from "ethers";
import * as dotenv from "dotenv";

import launchAbi from './launch_abi.json';
import approveAbi from './approve_abi.json';
import reservesAbi from './reserves_abi.json';

const VIRTUALS_BUY_ADDRESS = '0xF66DeA7b3e897cD44A5a231c61B6B4423d613259';
const VIRTUALS_TOKEN_ADDRESS = '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b';
const VIRTUALS_BUY_INPUT_DATA_ADDRESS = '0x8292B43aB73EfAC11FAF357419C38ACF448202C5';
const GAS_LIMIT = '0.05';

dotenv.config();

const BASE_RPC2 = "https://mainnet.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const connectToBaseNetwork = async (): Promise<ethers.JsonRpcProvider | undefined> => {
    try {
        const provider = new ethers.AnkrProvider("base", process.env.ANKR_KEY);
        //const provider = new ethers.JsonRpcProvider(BASE_RPC2);

        const network = await provider.getNetwork();
        console.log(`Conectado à rede: ${network.name} (Chain ID: ${network.chainId})`);
        return provider;
    } catch (error) {
        console.error("Erro ao conectar à rede Ethereum:", error);
    }
}

const tokenMonitor = async (provider: ethers.JsonRpcProvider, tokenAddress: string, transactionAddress: string): Promise<void> => {
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const approveInterface = new ethers.Interface(approveAbi);
    const buyContract = new ethers.Contract(VIRTUALS_BUY_ADDRESS, launchAbi, wallet)
    const tokenContract = new ethers.Contract(tokenAddress, approveAbi, provider)

    try {
        const receipt = await provider.getTransactionReceipt(transactionAddress);

        if (!receipt) throw Error('buy')

        const sendedValue = approveInterface.parseLog(receipt.logs[1])?.args[2];
        const recievedValue = approveInterface.parseLog(receipt.logs[4])?.args[2];

        const tokenInfo = await buyContract.tokenInfo(tokenAddress);
        const tokenName = tokenInfo[4][2];

        const pair = tokenInfo[2];

        const reservesContract = new ethers.Contract(pair, reservesAbi, wallet)

        let endMonitoring = false;
        while (!endMonitoring) {
            const rawBalance = await tokenContract.balanceOf(wallet.getAddress());
            if (Number(rawBalance.toString()) < 1000) {
                console.log(`Nenhum token de ${tokenName} na carteira, encerrando monitoramento`);
                endMonitoring = true;
                return;
            }
            if (rawBalance < recievedValue) {
                console.log(`Encerrando as operações em ${tokenName}`);
                console.log(`Tokens restantes: ${rawBalance}`);
                endMonitoring = true;
                return;
            }
            const [reserveA, reserveB] = await reservesContract.getReserves();

            const tokenA = await reservesContract.tokenA();
            const tokenB = await reservesContract.tokenB();

            let currentPrice;
            if (tokenA.toLowerCase() === tokenAddress.toLowerCase()) {
                currentPrice = Number(reserveB) / Number(reserveA);
            } else if (tokenB.toLowerCase() === tokenAddress.toLowerCase()) {
                currentPrice = Number(reserveA) / Number(reserveB);
            } else {
                throw new Error("Falha ao calcular o valor do token.");
            }
            const sendedValueDecimal = ethers.formatUnits(sendedValue, 'wei');
            const recievedValueDecimal = ethers.formatUnits(recievedValue, 'wei');

            const pricePerToken = parseFloat(sendedValueDecimal) / parseFloat(recievedValueDecimal);
            const PNL = ((currentPrice - pricePerToken) / pricePerToken) * 100;
            console.log(`-------------------------${tokenName}-------------------------`)
            console.log(`Balance: ${rawBalance}`);
            console.log(`Entry price: ${pricePerToken}`);
            console.log(`Current price: ${currentPrice}`);
            console.log(`${PNL > 0 ? `\x1b[32m` : `\x1b[41m`}PNL: ${PNL}%\x1b[0m`);

            if (PNL < -70) {
                console.log(`\x1b[41m70% de loss atingido, retirando entrada\x1b[0m`);
                await sellToken(tokenAddress, rawBalance, provider, tokenName);
            }
            if (PNL >= 100) {
                console.log(`\x1b[32m2X atingido, retirando risco\x1b[0m`);
                await sellToken(tokenAddress, rawBalance / 2n, provider, tokenName);
            }
            //console.log('force sell')
            //await sellToken(tokenAddress, rawBalance, provider, tokenName)
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } catch (error) {
        if (error.message === 'buy') buyToken(tokenAddress, '0.1', provider); // TODO: Alguma estratérgia de recompra
        console.error('Monitoring fail:', error);
        return;
    }

}

const approveVirtuals = async (provider: ethers.JsonRpcProvider, tokenAddress?: string, amount?: bigint): Promise<boolean> => {
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const approveContrat = new ethers.Contract(tokenAddress ?? VIRTUALS_TOKEN_ADDRESS, approveAbi, wallet);
    const nonce = await wallet.getNonce();

    const approvePayload = {
        nonce,
    }

    let approved = false;
    while (!approved) {
        try {
            const approve = await approveContrat.approve(VIRTUALS_BUY_INPUT_DATA_ADDRESS, amount ? amount.toString() : ethers.parseUnits('10000000000', 18).toString(), approvePayload);
            console.log('Transaction approved: ', approve.hash);
            approved = true;
        } catch (error) {
            if (error.message.includes('already known')) {
                console.log('Transaction already approved, ', error);
                approved = true;
            }
            if (error.message.includes('replacement transaction underpriced')) {
                console.log('Failed to approve transaction, retrying with more gas...');
                Object.assign(approvePayload, {
                    gasPrice: ethers.parseUnits(GAS_LIMIT, "gwei")
                });
            }
            if (error.message.includes('nonce too low')) {
                Object.assign(approvePayload, {
                    nonce: nonce + 1
                })
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return approved;
}

const buyToken = async (tokenAddress: string, amount: string, provider: ethers.JsonRpcProvider): Promise<string> => {
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const buyContract = new ethers.Contract(VIRTUALS_BUY_ADDRESS, launchAbi, wallet);
    const nonce = await wallet.getNonce();

    let hash = '';
    let purchased = false;

    const approvePayload = {
        nonce: nonce,
    }

    while (!purchased) {
        try {
            const amountInWei = ethers.parseUnits(amount, 18);
            const decoded = await buyContract.buy(amountInWei.toString(), tokenAddress, approvePayload);
            hash = decoded.hash;
            console.log('Token purchased: ', decoded.hash);
            purchased = true;
        } catch (error) {
            console.error(`Failed to buy token ${tokenAddress}, ${error}`);
            if (error.message.includes('nonce too low')) {
                console.log('Nonce error, retrying...')
                Object.assign(approvePayload, {
                    nonce: nonce + 1,
                });
            }
            if (error.message.includes('replacement transaction underpriced')) {
                console.log('Failed to buy token, retrying with more gas...');
                Object.assign(approvePayload, {
                    gasPrice: ethers.parseUnits(GAS_LIMIT, "gwei")
                });
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return hash;
}

const sellToken = async (tokenAddress: string, amount: bigint, provider: ethers.JsonRpcProvider, tokenName: string): Promise<void> => {
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const sellContract = new ethers.Contract(VIRTUALS_BUY_ADDRESS, launchAbi, wallet)

    await approveVirtuals(provider, tokenAddress, amount);

    console.log(`Selling ${amount.toString()} of ${tokenName}`);

    const nonce = await wallet.getNonce();
    const approvePayload = {
        nonce,
    }

    let selled = false;
    while (!selled) {
        try {
            const decoded = await sellContract.sell(amount.toString(), tokenAddress, approvePayload);
            console.log(`Selled ${amount.toString()} of ${tokenName}: ${decoded.hash}`);
            selled = true;
        } catch (error) {
            if (error.message.includes('nonce too low')) {
                console.error(`Nonce error, retrying`);
                Object.assign(approvePayload, {
                    nonce: nonce + 1,
                });
            }
            if (error.message.includes('replacement transaction underpriced')) {
                console.log('Failed to sell token, retrying with more gas...');
                Object.assign(approvePayload, {
                    gasPrice: ethers.parseUnits(GAS_LIMIT, "gwei")
                });
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
}

async function main() {
    const provider = await connectToBaseNetwork();
    if (!provider) return;
    approveVirtuals(provider);

    //provider?.on("block", async (blockNumber) => {
    const block = await provider.getBlock(25065271);
    if (!block) return;

    block.transactions.map(async transaction => {
        const transactionInfo = await provider.getTransaction(transaction);
        if (!transactionInfo) return;
        if (transactionInfo.to !== VIRTUALS_BUY_ADDRESS) return;
        const contract = new ethers.Interface(launchAbi);
        const receipt = await provider.getTransactionReceipt(transaction);
        if (!receipt) return;
        const contractAddress = receipt.logs.find(log => log.data === '0x')?.address;
        if (!contractAddress) {
            console.error('Error ao extrair o id do contrato do token');
            return;
        }
        console.log('Found an new token!!! - ', contractAddress);
        try {
            await new Promise(resolve => setTimeout(resolve, 5000));
            const decoded = contract.parseTransaction({ data: transactionInfo.data });
            if (!decoded) return;
            const buyHash = await buyToken(contractAddress, '0.1', provider);
            await new Promise(resolve => setTimeout(resolve, 5000));
            await tokenMonitor(provider, contractAddress, buyHash);
        } catch (error) {
            console.error("Erro ao processar a transação:", error);
        }
    })
    //})
}

async function manualBuy(tokenAddress: string, amount: string) {
    const provider = await connectToBaseNetwork();
    if (!provider) return;
    await approveVirtuals(provider);
    const buyHash = await buyToken(tokenAddress, amount, provider);
    await new Promise(resolve => setTimeout(resolve, 5000));
    await tokenMonitor(provider, tokenAddress, buyHash);
}

async function manualMonitor(tokenAddress: string, buyHash: string) {
    const provider = await connectToBaseNetwork();
    if (!provider) return;
    await tokenMonitor(provider, tokenAddress, buyHash);
}


async function manualSell(tokenAddress: string) {
    const provider = await connectToBaseNetwork();
    if (!provider) return;
    await sellToken(tokenAddress, 712n, provider, 'MANUAL')
}


const MANUAL_BUY_TOKEN_ADDRESS = '0x896F6B0113980F431a49Afe0C1D00486C89b26dd';
const MANUAL_BUY_AMOUNT = '10';
const MANUAL_BUY_HASH = '0xf77c3ebcac0f7e538bee4195d21476e65b3b4431be5a41c231ced84950b18d51';

//manualBuy(MANUAL_BUY_TOKEN_ADDRESS, MANUAL_BUY_AMOUNT)
manualMonitor(MANUAL_BUY_TOKEN_ADDRESS, MANUAL_BUY_HASH)
//manualSell(MANUAL_BUY_TOKEN_ADDRESS)

//main()

//CREATE ORDER OUT 0x3d1b389f1707DB3d4c5344d5669DBda6b5D6Ab51