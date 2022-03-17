import { Injectable } from '@angular/core';
import { Chain, TokenType, ChainStr} from './util.service';

@Injectable({
  providedIn: 'root'
})
export class VerifiedTokensService {

  constructor() { }

  tokens(chain: string): VerifiedToken[] {
    if (chain === ChainStr.RAICOIN) {
      return verifiedTokens;
    } else if (chain === ChainStr.RAICOIN_TEST) {
      return testVerifiedTokens;
    } else {
      return [];
    }
  }

}

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
]
