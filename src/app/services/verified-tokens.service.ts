import { Injectable } from '@angular/core';
import { Chain, TokenType, ChainStr, ChainHelper, U256} from './util.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VerifiedTokensService {

  verifiedTokensDict: {[chain: string]: {[address: string]: VerifiedToken}} = {};
  testVerifiedTokensDict: {[chain: string]: {[address: string]: VerifiedToken}} = {};

  constructor() {
    verifiedTokens.sort((lhs, rhs) => this.compare(lhs, rhs));
    testVerifiedTokens.sort((lhs, rhs) => this.compare(lhs, rhs));
    for (let token of verifiedTokens) {
      const chain = ChainHelper.toChainStr(token.chain);
      this.verifiedTokensDict[chain] = this.verifiedTokensDict[chain] || {};
      if (this.verifiedTokensDict[chain][token.address]) {
        console.error(`VerifiedTokensService::constructor: duplicated token `, token);
        continue;
      }
      this.verifiedTokensDict[chain][token.address] = token;
    }
    for (let token of testVerifiedTokens) {
      const chain = ChainHelper.toChainStr(token.chain);
      this.testVerifiedTokensDict[chain] = this.testVerifiedTokensDict[chain] || {};
      if (this.testVerifiedTokensDict[chain][token.address]) {
        console.error(`VerifiedTokensService::constructor: duplicated token `, token);
        continue;
      }
      this.testVerifiedTokensDict[chain][token.address] = token;
    }
   }

  shouldPin(token: VerifiedToken): boolean {
    if (token.address === '') return true;
    return hotTokens.findIndex(x => x === token.symbol) !== -1;
  }

  compare(lhs: VerifiedToken, rhs: VerifiedToken): number {
    if (this.shouldPin(lhs) && !this.shouldPin(rhs)) return -1;
    if (!this.shouldPin(lhs) && this.shouldPin(rhs)) return 1;
    
    const lhsSymbol = lhs.symbol.toUpperCase();
    const rhsSymbol = rhs.symbol.toUpperCase();
    if (lhsSymbol < rhsSymbol) return -1;
    if (lhsSymbol > rhsSymbol) return 1;

    if (lhs.chain < rhs.chain) return -1;
    if (lhs.chain > rhs.chain) return 1;

    return 0;
  }


  tokens(chain: string): VerifiedToken[] {
    if (chain === ChainStr.RAICOIN) {
      return verifiedTokens;
    } else if (chain === ChainStr.RAICOIN_TEST) {
      return testVerifiedTokens;
    } else {
      return [];
    }
  }

  token(chain: string, address: string | U256): VerifiedToken | undefined {
    if (ChainHelper.isNative(chain, address)) {
      address = '';
    } else if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) return undefined;
      address = ret.address!;
    }

    if (environment.current_chain === ChainStr.RAICOIN) {
      return this.verifiedTokensDict[chain]?.[address];
    } else if (environment.current_chain === ChainStr.RAICOIN_TEST) {
      return this.testVerifiedTokensDict[chain]?.[address];
    } else {
      return undefined;
    }
  }

  hasToken(chain: string, address: string): boolean {
    if (environment.current_chain === ChainStr.RAICOIN) {
      return !!this.verifiedTokensDict[chain]?.[address];
    } else if (environment.current_chain === ChainStr.RAICOIN_TEST) {
      return !!this.testVerifiedTokensDict[chain]?.[address];
    } else {
      return false;
    }
  }

  getNativeToken(destChain: string | Chain): VerifiedToken | undefined {
    if (typeof destChain !== 'string') {
      destChain = ChainHelper.toChainStr(destChain);
    }
    const currentChain = environment.current_chain;
    if (currentChain === ChainStr.RAICOIN) {
      return this.verifiedTokensDict[destChain]?.[''];
    } else if (currentChain === ChainStr.RAICOIN_TEST) { 
      if (!this.testVerifiedTokensDict) return undefined;
      return this.testVerifiedTokensDict[destChain]?.[''];
    } else {
      return undefined;
    }
  }

}

const hotTokens = [
  'BTC', 'WBTC', 'BTCB', 'ETH', 'USDT', 'BNB', 'USDC', 'BUSD', 'DAI',
];

export class VerifiedToken {
  chain: Chain = Chain.INVALID;
  address: string = '';
  type: TokenType = TokenType.INVALID;
  name: string = '';
  symbol: string = '';
  decimals: number = 0;
}

const verifiedTokens: VerifiedToken[] = [
  /* Ethereum begin */
  {
    chain: Chain.ETHEREUM,
    address: '',
    type: TokenType._20,
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    type: TokenType._20,
    name: 'Wrapped BTC',
    symbol: 'WBTC',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    type: TokenType._20,
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    type: TokenType._20,
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
    type: TokenType._20,
    name: 'Binance USD',
    symbol: 'BUSD',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    type: TokenType._20,
    name: 'Dai Stablecoin',
    symbol: 'DAI',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    type: TokenType._20,
    name: 'SHIBA INU',
    symbol: 'SHIB',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    type: TokenType._20,
    name: 'Uniswap',
    symbol: 'UNI',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x2AF5D2aD76741191D15Dfe7bF6aC92d4Bd912Ca3',
    type: TokenType._20,
    name: 'Bitfinex LEO Token',
    symbol: 'LEO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    type: TokenType._20,
    name: 'ChainLink Token',
    symbol: 'LINK',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x50D1c9771902476076eCFc8B2A83Ad6b9355a4c9',
    type: TokenType._20,
    name: 'FTX Token',
    symbol: 'FTT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    type: TokenType._20,
    name: 'Matic Token',
    symbol: 'MATIC',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b',
    type: TokenType._20,
    name: 'CRO',
    symbol: 'CRO',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x5c147e74D63B1D31AA3Fd78Eb229B65161983B2b',
    type: TokenType._20,
    name: 'Wrapped Flow',
    symbol: 'WFLOW',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381',
    type: TokenType._20,
    name: 'ApeCoin',
    symbol: 'APE',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x582d872A1B094FC48F5DE31D3B73F2D9bE47def1',
    type: TokenType._20,
    name: 'Wrapped TON Coin',
    symbol: 'TON',
    decimals: 9
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x3506424F91fD33084466F402d5D97f05F8e3b4AF',
    type: TokenType._20,
    name: 'chiliZ',
    symbol: 'CHZ',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x4a220E6096B25EADb88358cb44068A3248254675',
    type: TokenType._20,
    name: 'Quan',
    symbol: 'QNT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942',
    type: TokenType._20,
    name: 'Decentraland MANA',
    symbol: 'MANA',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x3845badAde8e6dFF049820680d1F14bD3903a5d0',
    type: TokenType._20,
    name: 'SAND',
    symbol: 'SAND',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
    type: TokenType._20,
    name: 'Aave Toke',
    symbol: 'AAVE',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b',
    type: TokenType._20,
    name: 'Axie Infinity Shard',
    symbol: 'AXS',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0000000000085d4780B73119b644AE5ecd22b376',
    type: TokenType._20,
    name: 'TrueUSD',
    symbol: 'TUSD',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x8E870D67F660D95d5be530380D0eC0bd388289E1',
    type: TokenType._20,
    name: 'Pax Dollar',
    symbol: 'USDP',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x75231F58b43240C9718Dd58B4967c5114342a86c',
    type: TokenType._20,
    name: 'OKB',
    symbol: 'OKB',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xC669928185DbCE49d2230CC9B0979BE6DC797957',
    type: TokenType._20,
    name: 'BitTorrent',
    symbol: 'BTT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x6f259637dcD74C767781E37Bc6133cd6A68aa161',
    type: TokenType._20,
    name: 'HuobiToken',
    symbol: 'HT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0C10bF8FcB7Bf5412187A595ab97a3609160b5c6',
    type: TokenType._20,
    name: 'Decentralized USD',
    symbol: 'USDD',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
    type: TokenType._20,
    name: 'Maker',
    symbol: 'MKR',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7',
    type: TokenType._20,
    name: 'Graph Token',
    symbol: 'GRT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x674C6Ad92Fd080e4004b2312b45f796a192D27a0',
    type: TokenType._20,
    name: 'Neutrino USD',
    symbol: 'USDN',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x4E15361FD6b4BB609Fa63C81A2be19d873717870',
    type: TokenType._20,
    name: 'Fantom Token',
    symbol: 'FTM',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F',
    type: TokenType._20,
    name: 'Synthetix Network Toke',
    symbol: 'SNX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
    type: TokenType._20,
    name: 'Lido DAO Token',
    symbol: 'LDO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
    type: TokenType._20,
    name: 'Paxos Gold',
    symbol: 'PAXG',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xB62132e35a6c13ee1EE0f84dC5d40bad8d815206',
    type: TokenType._20,
    name: 'Nexo',
    symbol: 'NEXO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xD533a949740bb3306d119CC777fa900bA034cd52',
    type: TokenType._20,
    name: 'Curve DAO Token',
    symbol: 'CRV',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c',
    type: TokenType._20,
    name: 'Enjin Coin',
    symbol: 'ENJ',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
    type: TokenType._20,
    name: 'Basic Attention Token',
    symbol: 'BAT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xE66747a101bFF2dBA3697199DCcE5b743b454759',
    type: TokenType._20,
    name: 'GateChainToken',
    symbol: 'GT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xc00e94Cb662C3520282E6f5717214004A7f26888',
    type: TokenType._20,
    name: 'Compound',
    symbol: 'COMP',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x956F47F50A910163D8BF957Cf5846D573E7f87CA',
    type: TokenType._20,
    name: 'Fei USD',
    symbol: 'FEI',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xe3c408BD53c31C085a1746AF401A4042954ff740',
    type: TokenType._20,
    name: 'GreenMetaverseToken',
    symbol: 'GMT',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD',
    type: TokenType._20,
    name: 'LoopringCoin V2',
    symbol: 'LRC',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x111111111117dC0aa78b770fA6A738034120C302',
    type: TokenType._20,
    name: '1INCH Token',
    symbol: '1INCH',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x6c6EE5e31d828De241282B9606C8e98Ea48526E2',
    type: TokenType._20,
    name: 'HoloToken',
    symbol: 'HOT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xaaAEBE6Fe48E54f431b0C390CfaF0b017d09D42d',
    type: TokenType._20,
    name: 'Celsius',
    symbol: 'CEL',
    decimals: 4
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',
    type: TokenType._20,
    name: 'Convex Token',
    symbol: 'CVX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
    type: TokenType._20,
    name: 'Gnosis Token',
    symbol: 'GNO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
    type: TokenType._20,
    name: 'yearn.finance',
    symbol: 'YFI',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x320623b8E4fF03373931769A31Fc52A4E78B5d70',
    type: TokenType._20,
    name: 'Reserve Rights',
    symbol: 'RSR',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
    type: TokenType._20,
    name: 'Ethereum Name Service',
    symbol: 'ENS',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd',
    type: TokenType._20,
    name: 'Gemini dollar',
    symbol: 'GUSD',
    decimals: 2
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x15D4c048F83bd7e37d49eA4C83a07267Ec4203dA',
    type: TokenType._20,
    name: 'Gala',
    symbol: 'GALA',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x8290333ceF9e6D528dD5618Fb97a76f268f3EDD4',
    type: TokenType._20,
    name: 'Ankr Network',
    symbol: 'ANKR',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x799ebfABE77a6E34311eeEe9825190B9ECe32824',
    type: TokenType._20,
    name: 'BTRST',
    symbol: 'BTRST',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x6fB3e0A217407EFFf7Ca062D46c26E5d60a14d69',
    type: TokenType._20,
    name: 'IoTeX Network',
    symbol: 'IOTX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429',
    type: TokenType._20,
    name: 'Golem Network Token',
    symbol: 'GLM',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xd26114cd6EE289AccF82350c8d8487fedB8A0C07',
    type: TokenType._20,
    name: 'OMGToken',
    symbol: 'OMG',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x720CD16b011b987Da3518fbf38c3071d4F0D1495',
    type: TokenType._20,
    name: 'Flux',
    symbol: 'FLUX',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xba100000625a3754423978a60c9317c58a424e3D',
    type: TokenType._20,
    name: 'Balancer',
    symbol: 'BAL',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x9992eC3cF6A55b00978cdDF2b27BC6882d88D1eC',
    type: TokenType._20,
    name: 'Polymath',
    symbol: 'POLY',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xE41d2489571d322189246DaFA5ebDe1F4699F498',
    type: TokenType._20,
    name: '0x Protocol Token',
    symbol: 'ZRX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x58b6A8A3302369DAEc383334672404Ee733aB239',
    type: TokenType._20,
    name: 'Livepeer Token',
    symbol: 'LPT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xdeFA4e8a7bcBA345F687a2f1456F5Edd9CE97202',
    type: TokenType._20,
    name: 'Kyber Network Crystal v2',
    symbol: 'KNC',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xfF20817765cB7f73d4bde2e66e067E58D11095C2',
    type: TokenType._20,
    name: 'Amp',
    symbol: 'AMP',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x476c5E26a75bd202a9683ffD34359C0CC15be0fF',
    type: TokenType._20,
    name: 'Serum',
    symbol: 'SRM',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xB64ef51C888972c908CFacf59B47C1AfBC0Ab8aC',
    type: TokenType._20,
    name: 'StorjToken',
    symbol: 'STORJ',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x3C4B6E6e1eA3D4863700D7F76b36B7f3D3f13E3d',
    type: TokenType._20,
    name: 'Voyager Token',
    symbol: 'VGX',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x18aAA7115705e8be94bfFEBDE57Af9BFc265B998',
    type: TokenType._20,
    name: 'Audius',
    symbol: 'AUDIO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF',
    type: TokenType._20,
    name: 'Immutable X',
    symbol: 'IMX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x8CE9137d39326AD0cD6491fb5CC0CbA0e089b6A9',
    type: TokenType._20,
    name: 'Swipe',
    symbol: 'SXP',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xba9d4199faB4f26eFE3551D490E3821486f135Ba',
    type: TokenType._20,
    name: 'SwissBorg Token',
    symbol: 'CHSB',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x5Ca381bBfb58f0092df149bD3D243b08B9a8386e',
    type: TokenType._20,
    name: 'MXCToken',
    symbol: 'MXC',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x4691937a7508860F876c9c0a2a617E7d9E945D4B',
    type: TokenType._20,
    name: 'Wootrade Network',
    symbol: 'WOO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xe83cE6bfb580583bd6A62B4Be7b34fC25F02910D',
    type: TokenType._20,
    name: 'Wrapped ABBC',
    symbol: 'WABBC',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x04Fa0d235C4abf4BcF4787aF4CF447DE572eF828',
    type: TokenType._20,
    name: 'UMA Voting Token v1',
    symbol: 'UMA',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x3a4f40631a4f906c2BaD353Ed06De7A5D3fCb430',
    type: TokenType._20,
    name: 'PlayDapp Token',
    symbol: 'PLA',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x00c83aeCC790e8a4453e5dD3B0B4b3680501a7A7',
    type: TokenType._20,
    name: 'SKALE',
    symbol: 'SKL',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xCC8Fa225D80b9c7D42F96e9570156c65D6cAAa25',
    type: TokenType._20,
    name: 'Smooth Love Potion',
    symbol: 'SLP',
    decimals: 0
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3',
    type: TokenType._20,
    name: 'Dogelon',
    symbol: 'ELON',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x198d14F2Ad9CE69E76ea330B374DE4957C3F850a',
    type: TokenType._20,
    name: 'APENFT',
    symbol: 'NFT',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0f51bb10119727a7e5eA3538074fb341F56B09Ad',
    type: TokenType._20,
    name: 'DAO Maker',
    symbol: 'DAO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x6B3595068778DD592e39A122f4f5a5cF09C90fE2',
    type: TokenType._20,
    name: 'SushiToken',
    symbol: 'SUSHI',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x41e5560054824eA6B0732E656E3Ad64E20e94E45',
    type: TokenType._20,
    name: 'Civic',
    symbol: 'CVC',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC',
    type: TokenType._20,
    name: 'KEEP Token',
    symbol: 'KEEP',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0FD10b9899882a6f2fcb5c371E17e70FdEe00C38',
    type: TokenType._20,
    name: 'Pundi X Token',
    symbol: 'PUNDIX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30',
    type: TokenType._20,
    name: 'Injective Token',
    symbol: 'INJ',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24',
    type: TokenType._20,
    name: 'Render Token',
    symbol: 'RNDR',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xDDB3422497E61e13543BeA06989C0789117555c5',
    type: TokenType._20,
    name: 'COTI Token',
    symbol: 'COTI',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x408e41876cCCDC0F92210600ef50372656052a38',
    type: TokenType._20,
    name: 'Republic Token',
    symbol: 'REN',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x7A58c0Be72BE218B41C608b7Fe7C5bB630736C71',
    type: TokenType._20,
    name: 'ConstitutionDAO',
    symbol: 'PEOPLE',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xD13c7342e1ef687C5ad21b27c2b65D772cAb5C8c',
    type: TokenType._20,
    name: 'Ultra Token',
    symbol: 'UOS',
    decimals: 4
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xFE3E6a25e6b192A42a44ecDDCd13796471735ACf',
    type: TokenType._20,
    name: 'Reef.finance',
    symbol: 'REEF',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x8C543AED163909142695f2d2aCd0D55791a9Edb9',
    type: TokenType._20,
    name: 'VLX',
    symbol: 'VLX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x4F9254C83EB525f9FCf346490bbb3ed28a81C667',
    type: TokenType._20,
    name: 'CelerToken',
    symbol: 'CELR',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x4fE83213D56308330EC302a8BD641f1d0113A4Cc',
    type: TokenType._20,
    name: 'NuCypher',
    symbol: 'NU',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x090185f2135308BaD17527004364eBcC2D37e5F6',
    type: TokenType._20,
    name: 'Spell Token',
    symbol: 'SPELL',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x8f8221aFbB33998d8584A2B05749bA73c37a938a',
    type: TokenType._20,
    name: 'Request Token',
    symbol: 'REQ',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x8c15Ef5b4B21951d50E53E4fbdA8298FFAD25057',
    type: TokenType._20,
    name: 'Function X',
    symbol: 'FX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xc7283b66Eb1EB5FB86327f08e1B5816b0720212B',
    type: TokenType._20,
    name: 'Tribe',
    symbol: 'TRIBE',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xff56Cc6b1E6dEd347aA0B7676C85AB0B3D08B0FA',
    type: TokenType._20,
    name: 'Orbs',
    symbol: 'ORBS',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x744d70FDBE2Ba4CF95131626614a1763DF805B9E',
    type: TokenType._20,
    name: 'Status Network Token',
    symbol: 'SNT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x967da4048cD07aB37855c090aAF366e4ce1b9F48',
    type: TokenType._20,
    name: 'Ocean Token',
    symbol: 'OCEAN',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x607F4C5BB672230e8672085532f7e901544a7375',
    type: TokenType._20,
    name: 'iEx.ec Network Token',
    symbol: 'RLC',
    decimals: 9
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x11eeF04c884E24d9B7B4760e7476D06ddF797f36',
    type: TokenType._20,
    name: 'MX Token',
    symbol: 'MX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x595832F8FC6BF59c85C527fEC3740A1b7a361269',
    type: TokenType._20,
    name: 'PowerLedger',
    symbol: 'POWR',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x3597bfD533a99c9aa083587B074434E61Eb0A258',
    type: TokenType._20,
    name: 'DENT',
    symbol: 'DENT',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0b38210ea11411557c13457D4dA7dC6ea731B88a',
    type: TokenType._20,
    name: 'API3',
    symbol: 'API3',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x55296f69f40Ea6d20E478533C15A6B08B654E758',
    type: TokenType._20,
    name: 'XY Oracle',
    symbol: 'XYO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C',
    type: TokenType._20,
    name: 'Bancor Network Token',
    symbol: 'BNT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x79C7EF95aD32DcD5ECadB231568Bb03dF7824815',
    type: TokenType._20,
    name: 'ARIVA',
    symbol: 'ARV',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x888888848B652B3E3a0f34c96E00EEC0F3a23F72',
    type: TokenType._20,
    name: 'Alien Worlds Trilium',
    symbol: 'TLM',
    decimals: 4
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x389999216860AB8E0175387A0c90E5c52522C945',
    type: TokenType._20,
    name: 'FEGtoken',
    symbol: 'FEG',
    decimals: 9
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xAE12C5930881c53715B369ceC7606B70d8EB229f',
    type: TokenType._20,
    name: 'Coin98',
    symbol: 'C98',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x2F141Ce366a2462f02cEA3D12CF93E4DCa49e4Fd',
    type: TokenType._20,
    name: 'Free Coin',
    symbol: 'FREE',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xC17c30e98541188614dF99239cABD40280810cA3',
    type: TokenType._20,
    name: 'EverRise',
    symbol: 'RISE',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xAC51066d7bEC65Dc4589368da368b212745d63E8',
    type: TokenType._20,
    name: 'ALICE',
    symbol: 'ALICE',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x43Dfc4159D86F3A37A5A4B3D4580b888ad7d4DDd',
    type: TokenType._20,
    name: 'DODO bird',
    symbol: 'DODO',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x84FA8f52E437Ac04107EC1768764B2b39287CB3e',
    type: TokenType._20,
    name: 'Grove Token',
    symbol: 'GVR',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x419D0d8BdD9aF5e606Ae2232ed285Aff190E711b',
    type: TokenType._20,
    name: 'FunFair',
    symbol: 'FUN',
    decimals: 8
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8',
    type: TokenType._20,
    name: 'agEUR',
    symbol: 'agEUR',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x9E32b13ce7f2E80A01932B42553652E053D6ed8e',
    type: TokenType._20,
    name: 'Metis Token',
    symbol: 'METIS',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x037A54AaB062628C9Bbae1FDB1583c195585fe41',
    type: TokenType._20,
    name: 'LCX',
    symbol: 'LCX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x662b67d00A13FAf93254714DD601F5Ed49Ef2F51',
    type: TokenType._20,
    name: 'Orbit Chain',
    symbol: 'ORC',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x1EA48B9965bb5086F3b468E50ED93888a661fc17',
    type: TokenType._20,
    name: 'Moneta',
    symbol: 'MON',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0ab87046fBb341D058F17CBC4c1133F25a20a52f',
    type: TokenType._20,
    name: 'Governance OHM',
    symbol: 'GOHM',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x467719aD09025FcC6cF6F8311755809d45a5E5f3',
    type: TokenType._20,
    name: 'Axelar',
    symbol: 'AXL',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
    type: TokenType._20,
    name: 'Frax',
    symbol: 'FRAX',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xa23C1194d421F252b4e6D5edcc3205F7650a4eBE',
    type: TokenType._20,
    name: 'Launch Block',
    symbol: 'LBP',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x7Ddc52c4De30e94Be3A6A0A2b259b2850f421989',
    type: TokenType._20,
    name: 'GoMining Token',
    symbol: 'GMT',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x8355DBE8B0e275ABAd27eB843F3eaF3FC855e525',
    type: TokenType._20,
    name: 'WOOL',
    symbol: 'WOOL',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x0d438F3b5175Bebc262bF23753C1E53d03432bDE',
    type: TokenType._20,
    name: 'Wrapped NXM',
    symbol: 'WNXM',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x7D29A64504629172a429e64183D6673b9dAcbFCe',
    type: TokenType._20,
    name: 'VectorspaceAI',
    symbol: 'VXV',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xC08512927D12348F6620a698105e1BAac6EcD911',
    type: TokenType._20,
    name: 'GMO JPY',
    symbol: 'GYEN',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x24E89bDf2f65326b94E36978A7EDeAc63623DAFA',
    type: TokenType._20,
    name: 'Tiger King',
    symbol: 'TKING',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x7420B4b9a0110cdC71fB720908340C03F9Bc03EC',
    type: TokenType._20,
    name: 'JasmyCoin',
    symbol: 'JASMY',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0',
    type: TokenType._20,
    name: 'Frax Share',
    symbol: 'FXS',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xB4272071eCAdd69d933AdcD19cA99fe80664fc08',
    type: TokenType._20,
    name: 'CryptoFranc',
    symbol: 'XCHF',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x1cEB5cB57C4D4E2b2433641b95Dd330A33185A44',
    type: TokenType._20,
    name: 'Keep3rV1',
    symbol: 'KP3R',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0x48C3399719B582dD63eB5AADf12A40B4C3f52FA2',
    type: TokenType._20,
    name: 'StakeWise',
    symbol: 'SWISE',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM,
    address: '0xeD35af169aF46a02eE13b9d79Eb57d6D68C1749e',
    type: TokenType._20,
    name: 'OMI Token',
    symbol: 'OMI',
    decimals: 18
  },
  // todo: 

  /* Ethereum end */

  /* BSC begin */
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '',
    type: TokenType._20,
    name: 'Binance coin',
    symbol: 'BNB',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    type: TokenType._20,
    name: 'BTCB Token',
    symbol: 'BTCB',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x55d398326f99059fF775485246999027B3197955',
    type: TokenType._20,
    name: 'Tether USD',
    symbol: 'USDT',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    type: TokenType._20,
    name: 'Ethereum Token',
    symbol: 'ETH',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    type: TokenType._20,
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    type: TokenType._20,
    name: 'BUSD Token',
    symbol: 'BUSD',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    type: TokenType._20,
    name: 'Dai Token',
    symbol: 'DAI',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    type: TokenType._20,
    name: 'PancakeSwap Token',
    symbol: 'CAKE',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x965F527D9159dCe6288a2219DB51fc6Eef120dD1',
    type: TokenType._20,
    name: 'Biswap',
    symbol: 'BSW',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x2859e4544C4bB03966803b044A93563Bd2D0DD4D',
    type: TokenType._20,
    name: 'SHIBA INU',
    symbol: 'SHIB',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x383094a91Ef2767Eed2B063ea40465670bf1C83f',
    type: TokenType._20,
    name: 'LIMOCOIN SWAP',
    symbol: 'LMCSWAP',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',
    type: TokenType._20,
    name: 'XRP Token',
    symbol: 'XRP',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
    type: TokenType._20,
    name: 'Dogecoin',
    symbol: 'DOGE',
    decimals: 8
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xd32d01A43c869EdcD1117C640fBDcfCFD97d9d65',
    type: TokenType._20,
    name: 'Nominex',
    symbol: 'NMX',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xc748673057861a797275CD8A068AbB95A902e8de',
    type: TokenType._20,
    name: 'Baby Doge Coin',
    symbol: 'BabyDoge',
    decimals: 9
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x3019BF2a2eF8040C242C9a4c5c4BD4C81678b2A1',
    type: TokenType._20,
    name: 'Green Metaverse Token',
    symbol: 'GMT',
    decimals: 8
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',
    type: TokenType._20,
    name: 'Cardano Token',
    symbol: 'ADA',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x4B0F1812e5Df2A09796481Ff14017e6005508003',
    type: TokenType._20,
    name: 'Trust Wallet',
    symbol: 'TWT',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xCC42724C6683B7E57334c4E856f4c9965ED682bD',
    type: TokenType._20,
    name: 'Matic Token',
    symbol: 'MATIC',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x603c7f932ED1fc6575303D8Fb018fDCBb0f39a95',
    type: TokenType._20,
    name: 'ApeSwapFinance Banana',
    symbol: 'BANANA',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',
    type: TokenType._20,
    name: 'Polkadot Token',
    symbol: 'DOT',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x9131066022B909C65eDD1aaf7fF213dACF4E86d0',
    type: TokenType._20,
    name: 'META-UTOPIA LAND',
    symbol: 'LAND',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x4e3cABD3AD77420FF9031d19899594041C420aeE',
    type: TokenType._20,
    name: 'Titano',
    symbol: 'TITANO',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x6679eB24F59dFe111864AEc72B443d1Da666B360',
    type: TokenType._20,
    name: 'ARIVA',
    symbol: 'ARV',
    decimals: 8
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
    type: TokenType._20,
    name: 'ChainLink Token',
    symbol: 'LINK',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x1CE0c2827e2eF14D5C4f29a091d735A204794041',
    type: TokenType._20,
    name: 'Avalanche',
    symbol: 'AVAX',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x42981d0bfbAf196529376EE702F2a9Eb9092fcB5',
    type: TokenType._20,
    name: 'SafeMoon',
    symbol: 'SFM',
    decimals: 9
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x154A9F9cbd3449AD22FDaE23044319D6eF2a1Fab',
    type: TokenType._20,
    name: 'CryptoBlades Skill Token',
    symbol: 'SKILL',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x2222227E22102Fe3322098e4CBfE18cFebD57c95',
    type: TokenType._20,
    name: 'Alien Worlds Trilium',
    symbol: 'TLM',
    decimals: 4
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x5CA42204cDaa70d5c773946e69dE942b85CA6706',
    type: TokenType._20,
    name: 'Position Token',
    symbol: 'POSI',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F',
    type: TokenType._20,
    name: 'AlpacaToken',
    symbol: 'ALPACA',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63',
    type: TokenType._20,
    name: 'Venus',
    symbol: 'XVS',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xD41FDb03Ba84762dD66a0af1a6C8540FF1ba5dfb',
    type: TokenType._20,
    name: 'SafePal Token',
    symbol: 'SFP',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x4338665CBB7B2485A8855A139b75D5e34AB0DB94',
    type: TokenType._20,
    name: 'Litecoin Token',
    symbol: 'LTC',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xd983AB71a284d6371908420d8Ac6407ca943F810',
    type: TokenType._20,
    name: 'Ultron',
    symbol: 'ULX',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x0Eb3a705fc54725037CC9e008bDede697f62F335',
    type: TokenType._20,
    name: 'Cosmos Token',
    symbol: 'ATOM',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xfb5B838b6cfEEdC2873aB27866079AC55363D37E',
    type: TokenType._20,
    name: 'FLOKI',
    symbol: 'FLOKI',
    decimals: 9
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xb465f3cb6Aba6eE375E12918387DE1eaC2301B05',
    type: TokenType._20,
    name: 'Trivian Token',
    symbol: 'TRIVIA',
    decimals: 3
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xBf5140A22578168FD562DCcF235E5D43A02ce9B1',
    type: TokenType._20,
    name: 'Uniswap',
    symbol: 'UNI',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xacFC95585D80Ab62f67A14C566C1b7a49Fe91167',
    type: TokenType._20,
    name: 'FEGtoken',
    symbol: 'FEG',
    decimals: 9
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x2AA504586d6CaB3C59Fa629f74c586d78b93A025',
    type: TokenType._20,
    name: 'ArenaPlay',
    symbol: 'APC',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x7dDEE176F665cD201F93eEDE625770E2fD911990',
    type: TokenType._20,
    name: 'pTokens GALA',
    symbol: 'GALA',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xAD29AbB318791D579433D831ed122aFeAf29dcfe',
    type: TokenType._20,
    name: 'Fantom',
    symbol: 'FTM',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x9C65AB58d8d978DB963e63f2bfB7121627e3a739',
    type: TokenType._20,
    name: 'MDX Token',
    symbol: 'MDX',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x3d6545b08693daE087E957cb1180ee38B9e3c25E',
    type: TokenType._20,
    name: 'Ethereum Classic',
    symbol: 'ETC',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x8A5d7FCD4c90421d21d30fCC4435948aC3618B2f',
    type: TokenType._20,
    name: 'Cake Monster',
    symbol: 'MONSTA',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xf307910A4c7bbc79691fD374889b36d8531B08e3',
    type: TokenType._20,
    name: 'Ankr',
    symbol: 'ANKR',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x1Fa4a73a3F0133f0025378af00236f3aBDEE5D63',
    type: TokenType._20,
    name: 'NEAR Protocol',
    symbol: 'NEAR',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xF21768cCBC73Ea5B6fd3C687208a7c2def2d966e',
    type: TokenType._20,
    name: 'Reef.finance',
    symbol: 'REEF',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x56b6fB708fC5732DEC1Afc8D8556423A2EDcCbD6',
    type: TokenType._20,
    name: 'EOS Token',
    symbol: 'EOS',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xd9025e25Bb6cF39f8c926A704039D2DD51088063',
    type: TokenType._20,
    name: 'Coinary Token',
    symbol: 'CYT',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xb86AbCb37C3A4B64f74f59301AFF131a1BEcC787',
    type: TokenType._20,
    name: 'Zilliqa',
    symbol: 'ZIL',
    decimals: 12
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x111111111117dC0aa78b770fA6A738034120C302',
    type: TokenType._20,
    name: '1INCH Token',
    symbol: '1INCH',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xaEC945e04baF28b135Fa7c640f624f8D90F1C3a6',
    type: TokenType._20,
    name: 'Coin98',
    symbol: 'C98',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x352Cb5E19b12FC216548a2677bD0fce83BaE434B',
    type: TokenType._20,
    name: 'BitTorrent',
    symbol: 'BTT',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xA64455a4553C9034236734FadDAddbb64aCE4Cc7',
    type: TokenType._20,
    name: 'FC Santos Fan Token',
    symbol: 'SANTOS',
    decimals: 8
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xA58950F05FeA2277d2608748412bf9F802eA4901',
    type: TokenType._20,
    name: 'Wall Street Games',
    symbol: 'WSG',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x12e34cDf6A031a10FE241864c32fB03a4FDaD739',
    type: TokenType._20,
    name: 'FREE coin BSC',
    symbol: 'FREE',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xE02dF9e3e622DeBdD69fb838bB799E3F168902c5',
    type: TokenType._20,
    name: 'BakeryToken',
    symbol: 'BAKE',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x4C882ec256823eE773B25b414d36F92ef58a7c0C',
    type: TokenType._20,
    name: 'pStake Finance',
    symbol: 'PSTAKE',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xC17c30e98541188614dF99239cABD40280810cA3',
    type: TokenType._20,
    name: 'EverRise',
    symbol: 'RISE',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x20D39a5130F799b95B55a930E5b7eBC589eA9Ed8',
    type: TokenType._20,
    name: 'Heroes&Empires',
    symbol: 'HE',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x715D400F88C167884bbCc41C5FeA407ed4D2f8A0',
    type: TokenType._20,
    name: 'Axie Infinity Shard',
    symbol: 'AXS',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x606FB7969fC1b5CAd58e64b12Cf827FB65eE4875',
    type: TokenType._20,
    name: 'Okse',
    symbol: 'OKSE',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xAC51066d7bEC65Dc4589368da368b212745d63E8',
    type: TokenType._20,
    name: 'ALICE',
    symbol: 'ALICE',
    decimals: 6
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf',
    type: TokenType._20,
    name: 'Bitcoin Cash Token',
    symbol: 'BCH',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xfe56d5892BDffC7BF58f2E84BE1b2C32D21C308b',
    type: TokenType._20,
    name: 'Kyber Network Crystal',
    symbol: 'KNC',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xAe9269f27437f0fcBC232d39Ec814844a51d6b8f',
    type: TokenType._20,
    name: 'Burger Swap',
    symbol: 'BURGER',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xCa3F508B8e4Dd382eE878A314789373D80A5190A',
    type: TokenType._20,
    name: 'beefy.finance',
    symbol: 'BIFI',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x67ee3Cb086F8a16f34beE3ca72FAD36F7Db929e2',
    type: TokenType._20,
    name: 'DODO bird',
    symbol: 'DODO',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xaFb64E73dEf6fAa8B6Ef9a6fb7312d5C4C15ebDB',
    type: TokenType._20,
    name: 'Grove Token',
    symbol: 'GVR',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0xe552Fb52a4F19e44ef5A967632DBc320B0820639',
    type: TokenType._20,
    name: 'Metis Token',
    symbol: 'METIS',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN,
    address: '0x7Ddc52c4De30e94Be3A6A0A2b259b2850f421989',
    type: TokenType._20,
    name: 'GoMining Token',
    symbol: 'GMT',
    decimals: 18
  },
  // todo: 


  /* BSC end */

]

const testVerifiedTokens: VerifiedToken[] = [
  {
    chain: Chain.RAICOIN_TEST,
    address:'rai_3uejbias6jjryyh6uqydfjxyce1uqk8b666hazu9tb6owjg6b363hhwifiuz',
    type:TokenType._20,
    name:'Bitcoin',
    symbol:'BTC',
    decimals: 8
  },
  {
    chain: Chain.RAICOIN_TEST,
    address:'rai_1taim3p6qd1no7tdtnmhq15kifhg51p5yg45pi9i7wsiozmwugbfq8wh747h',
    type:TokenType._20,
    name:'Ethereum',
    symbol:'ETH',
    decimals: 18
  },
  {
    chain: Chain.RAICOIN_TEST,
    address:'rai_38ssase4ppphh4qio8bucsuobp5khgmm6zig5fm9rx46okrfk1h3azip3pjr',
    type:TokenType._20,
    name:'Tether USDT',
    symbol:'USDT',
    decimals: 6
  },
  {
    chain: Chain.RAICOIN_TEST,
    address:'rai_1timaah5teuxjjqeu43qby9k3jruyrjp8t8b4jh7z6bkud59g3eyb58oeejh',
    type:TokenType._721,
    name:'Ethereum Name Service',
    symbol:'ENS',
    decimals: 0
  },
  /* Raicoin Testnet End*/


  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'',
    type:TokenType._20,
    name:'Binance coin',
    symbol:'BNB',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0x6ce8dA28E2f864420840cF74474eFf5fD80E65B8',
    type:TokenType._20,
    name:'BTCB Token',
    symbol:'BTCB',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
    type:TokenType._20,
    name:'Binance USD',
    symbol:'BUSD',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0xd66c6B4F0be8CE5b39D52E0Fd1344c389929B378',
    type:TokenType._20,
    name:'Ethereum Token',
    symbol:'ETH',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    type:TokenType._20,
    name:'USDT Token',
    symbol:'USDT',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0x64544969ed7EBf5f083679233325356EbE738930',
    type:TokenType._20,
    name:'USDC Token',
    symbol:'USDC',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0xEC5dCb5Dbf4B114C9d0F65BcCAb49EC54F6A0867',
    type:TokenType._20,
    name:'DAI Token',
    symbol:'DAI',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0xa83575490D7df4E2F47b7D38ef351a2722cA45b9',
    type:TokenType._20,
    name:'Binance-Peg XRP Token',
    symbol:'XRP',
    decimals: 18
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0xAa2ADE8D4a9b72298478c2A5059da1A5900dF875',
    type:TokenType._721,
    name:'ParallelBox',
    symbol:'PRB',
    decimals: 0
  },
  {
    chain: Chain.BINANCE_SMART_CHAIN_TEST,
    address:'0x259BECb3C69290b3F9Ff35BBD063fae36580EFE6',
    type:TokenType._721,
    name:'Galaxy OAT',
    symbol:'OAT',
    decimals: 0
  },

  /* end of Binance Smart Chain Testnet */



  {
    chain: Chain.ETHEREUM_TEST_GOERLI,
    address: '',
    type: TokenType._20,
    name: 'Goerli',
    symbol: 'ETH',
    decimals: 18
  },
  {
    chain: Chain.ETHEREUM_TEST_GOERLI,
    address: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F',
    type: TokenType._20,
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6
  },
  {
    chain: Chain.ETHEREUM_TEST_GOERLI,
    address: '0x162d69731650cfdac48bffebF2fa8FCd50AC0Db9',
    type: TokenType._721,
    name: 'BoredApeYachtClub',
    symbol: 'BAYC',
    decimals: 0
  },
  /* end of Goerli Testnet */
]
