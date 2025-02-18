const fs = require("fs");
const fetch = require("node-fetch");
const path = require("path");

const outputPath = path.join(__dirname, "../out.txt");
const USER = "alice";
const USER_PASSWORD = "password";
const HOST_URI = "http://127.0.0.1:18443";
const WALLET_NAME = "testwallet";

async function rpcCall(method, params = [], useWallet = false) {
  const url = useWallet ? `${HOST_URI}/wallet/${WALLET_NAME}` : HOST_URI;

  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: "test",
      method,
      params,
    }),
    headers: {
      "Content-Type": "text/plain",
      Authorization:
        "Basic " +
        Buffer.from(`${USER}:${USER_PASSWORD}`).toString("base64"),
    },
  });

  const result = await response.json();
  if (result.error) {
    throw new Error(`${method} failed: ${result.error.message}`);
  }
  return result.result;
}

async function ensureWalletExists() {
  try {
    const wallets = await rpcCall("listwallets");
    if (wallets.includes(WALLET_NAME)) {
      console.log(`Wallet "${WALLET_NAME}" is already loaded.`);
      return;
    }
    try {
      await rpcCall("loadwallet", [WALLET_NAME]);
      console.log(`Wallet "${WALLET_NAME}" loaded successfully.`);
    } catch (loadError) {
      console.log(`Wallet not found, creating a new one: ${WALLET_NAME}`);
      await rpcCall("createwallet", [WALLET_NAME]);
    }
  } catch (error) {
    console.error("Error checking wallet:", error.message);
  }
}

async function main() {
  try {
    console.log("Starting Bitcoin RPC operations...");

    await ensureWalletExists();

    const miningAddress = await rpcCall("getnewaddress", [], true);
    console.log("Mining address:", miningAddress);

    console.log("Mining 103 blocks...");
    await rpcCall("generatetoaddress", [103, miningAddress]);
    console.log("Mining complete!");

    const utxos = await rpcCall("listunspent", [1, 9999999], true);
    if (utxos.length === 0) {
      throw new Error("No UTXOs available!");
    }
    const utxo = utxos[0];

    const recipientAddress = "bcrt1qq2yshcmzdlznnpxx258xswqlmqcxjs4dssfxt2";
    const message = "We are all Satoshi!!";
    const messageHex = Buffer.from(message, "utf8").toString("hex");
    const opReturnScript = `${messageHex}`;

    const txOutputs = {
      [recipientAddress]: 100,
      data: opReturnScript,
    };

    const rawTx = await rpcCall(
      "createrawtransaction",
      [[utxo], txOutputs],
      true
    );

    const fundedTx = await rpcCall(
      "fundrawtransaction",
      [rawTx, { fee_rate: 21 }],
      true
    );

    const signedTx = await rpcCall(
      "signrawtransactionwithwallet",
      [fundedTx.hex],
      true
    );

    if (!signedTx.complete) {
      throw new Error("Transaction signing failed!");
    }

    const txid = await rpcCall("sendrawtransaction", [signedTx.hex], true);
    console.log("Transaction ID:", txid);

    fs.writeFileSync(outputPath, txid);
    console.log(`Transaction ID saved to ${outputPath}`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
