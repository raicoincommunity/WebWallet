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

  getNativeToken(currentChain: string, destChain: string | Chain): VerifiedToken | undefined {
    if (typeof destChain !== 'string') {
      destChain = ChainHelper.toChainStr(destChain);
    }

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

const hotTokens = ['BTC', 'WBTC', 'BTCB', 'ETH', 'USDT', 'BNB', 'USDC'];

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
