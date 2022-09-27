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
      this.verifiedTokensDict[chain][token.address] = token;
    }
    for (let token of testVerifiedTokens) {
      const chain = ChainHelper.toChainStr(token.chain);
      this.testVerifiedTokensDict[chain] = this.testVerifiedTokensDict[chain] || {};
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

// todo:
const verifiedTokens: VerifiedToken[] = [
  /* Ethereum */
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
  // todo: 

  /* Ethereum end */


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
    address:'0xAa2ADE8D4a9b72298478c2A5059da1A5900dF875',
    type:TokenType._721,
    name:'ParallelBox',
    symbol:'PRB',
    decimals: 0
  },

  /* end of Binance Smart Chain Testnet */



  {
    chain: Chain.ETHEREUM_TEST_GOERLI,
    address:'',
    type:TokenType._20,
    name:'Goerli',
    symbol:'ETH',
    decimals: 18
  },
  /* end of Goerli Testnet */
]
