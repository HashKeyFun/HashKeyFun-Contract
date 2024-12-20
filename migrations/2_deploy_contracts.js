const TokenFactory = artifacts.require("TokenFactory");

module.exports = async function (deployer, network, accounts) {
  let adminAddresses;
  let approvalThreshold;

  if (network === "development") {
    adminAddresses = [accounts[1], accounts[2], accounts[3]]; // 로컬 Ganache 네트워크
    approvalThreshold = 2;
  } else if (network === "testnet") {
    adminAddresses = [
      "0x83d2922e3bae9368BeCF6297A392439E626cA95f",
      "0x61a273dc4Df5b24185d614c69c52c4bE14f74F68",
      "0x91D35b964b2ae6a090D7fEb8ee94370103B731Be",
    ];
    approvalThreshold = 2;
  } else {
    throw new Error(`Unsupported network: ${network}`);
  }

  await deployer.deploy(TokenFactory, adminAddresses, approvalThreshold);
};
