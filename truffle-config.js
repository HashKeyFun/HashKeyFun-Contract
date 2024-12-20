require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');

const privateKey = process.env.PRIVATE_KEY;

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 7545,
      network_id: "*", // Match any network id
      gas: 5000000
    },
    testnet: {
      provider: () =>
          new HDWalletProvider(
              privateKey,
              'https://hashkeychain-testnet.alt.technology'
          ),
      network_id: 133,
      gas: 5000000,
      gasPrice: 1000000000 // 1 Gwei
    }
  },
  compilers: {
    solc: {
      version: "0.8.19",
      settings: {
        optimizer: {
          enabled: true, // Default: false
          runs: 200      // Default: 200
        },
      }
    }
  }
};
