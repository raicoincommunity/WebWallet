import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from "@angular/router";
import { NotificationService } from '../../services/notification.service';
import { WalletsService, Amount, BlockStatus } from '../../services/wallets.service';
import { Block, BlockInfo } from '../../services/blocks.service';
import { ServerService } from '../../services/server.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { AliasService } from '../../services/alias.service';
import { TokenService } from '../../services/token.service';
import { U128, U256, U8, TokenType, TokenHelper, ExtensionTokenOp, ExtensionTokenOpStr } from '../../services/util.service';
import { VerifiedTokensService } from '../../services/verified-tokens.service';

@Component({
  selector: 'app-account-details',
  templateUrl: './account-details.component.html',
  styleUrls: ['./account-details.component.css']
})
export class AccountDetailsComponent implements OnInit {

  address: string = '';
  empty = true;
  finished = false;

  cache: { [hash: string]: { [key: string]: any } } = {};

  constructor(
    private route: ActivatedRoute,
    private translate: TranslateService,
    private wallets: WalletsService,
    private server: ServerService,
    private alias: AliasService,
    private token: TokenService,
    private verified: VerifiedTokensService,
    private notification: NotificationService) {

  }

  ngOnInit(): void {
    this.address = this.route.snapshot.params.address;
    if (!this.address.startsWith('rai_') || this.address.length !== 64) return;
    if (!this.wallets.getRecentBlocksSize(this.address)) {
      this.wallets.setRecentBlocksSize(10, this.address);
    }
    if (!this.token.getRecentBlocksSize(this.address)) {
      this.token.setRecentBlocksSize(10, this.address);
    }
    this.alias.addAccount(this.address);
    this.token.addAccount(this.address);
  }

  copied() {
    let msg = marker(`Account address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  balance(): Amount {
    return this.wallets.balance(this.address);
  }

  pending(): Amount {
    return this.wallets.pending(this.address);
  }

  receivable(): Amount {
    return this.wallets.receivable(this.address);
  }

  representative(): string {
    return this.wallets.representative(this.address);
  }

  blocks(): BlockInfo[] {
    let blocks = this.wallets.recentBlocks(this.address);
    this.empty = blocks.length === 0;
    this.finished = this.empty || blocks[blocks.length - 1].block.height().eq(0);
    return blocks;
  }

  @cacheBlockInfo()
  amountShown(info: BlockInfo): AmountShown {
    const result = new AmountShown();
    const address = info.block.account().toAccountAddress();
    const tokenBlock = this.token.tokenBlock(address, info.block.height());
    if (!tokenBlock) {
      const value = new U256(info.amount.value);
      if (value.eq(0)) {
        result.cache = false;
        return result;
      }
      const valueStr = value.toBalanceStr(new U8(9));
      if (info.amount.negative) {
        result.sign = 2;
        result.amount = `-${valueStr} RAI`;
      } else {
        result.sign = 1;
        result.amount = `+${valueStr} RAI`;
      }
      return result;
    } else {
      result.amount = '';
      result.sign = 0;
      const { type, chain, address, decimals } = tokenBlock;
      const symbol = this.queryTokenSymbol(chain, address, tokenBlock.symbol);
      if (!info.block.hash().eq(tokenBlock.hash) || !tokenBlock.statusCode.eq(0)) {
        return result;
      }

      if (!tokenBlock.valueOp || tokenBlock.valueOp === 'none') {
        const tokenExtension = tokenBlock.getExtension();
        if (!tokenExtension || !tokenExtension.op) return result;
        const op = TokenHelper.toOp(tokenExtension.op);
        if (op === ExtensionTokenOp.MINT || op === ExtensionTokenOp.SWAP) {
          const value = new U256(tokenExtension.value || tokenExtension.max_offer
                                 || tokenExtension.value_offer);
          result.amount = this.formatAmount(type, value, decimals, symbol);
          if (!result.amount) result.amount = '0 RAI';
        } else if (op === ExtensionTokenOp.CREATE) {
          if (tokenBlock.type === TokenType._20) {
            const value = new U256(tokenExtension.init_supply);
            result.amount = this.formatAmount(type, value, decimals, symbol);
          } else if (tokenBlock.type === TokenType._721) {
            result.amount = `0 ${symbol}`;
          }
        }

        return result;
      }

      const value = this.formatAmount(type, tokenBlock.value, decimals, symbol);
      if (tokenBlock.valueOp === 'increase')
      {
        result.amount = `+` + value;
        result.sign = 1; 
      } else if (tokenBlock.valueOp === 'decrease') {
        result.amount = '-' + value;
        result.sign = 2; 
      } else {
        return result;
      }
      return result;
    }
  }

  @cacheBlockInfo()
  opStr(info: BlockInfo): string {
    const address = info.block.account().toAccountAddress();
    const tokenBlock = this.token.tokenBlock(address, info.block.height());
    if (!tokenBlock || !info.block.hash().eq(tokenBlock.hash)) {
      return info.block.opcode().toBlockOpcodeStr();
    } else {
      const tokenExtension = tokenBlock.getExtension();
      if (!tokenExtension || !tokenExtension.op) return 'change';
      if (tokenExtension.op !== ExtensionTokenOpStr.SWAP) {
        return tokenExtension.op;
      } else {
        return `${tokenExtension.op} ${tokenExtension.sub_op}`;
      }
    }
  }

  credit(): number {
    return this.wallets.credit(this.address);
  }

  dailyTxns(): string {
    let headTimestamp = this.wallets.headTimestamp(this.address);
    if (headTimestamp === 0) return '';
    let counter = this.wallets.headCounter(this.address);
    let now = this.server.getTimestamp();
    let credit = this.credit();
    let total = credit * 20;
    if (headTimestamp - (headTimestamp % 86400) === now - (now % 86400)) {
      return `${counter} / ${total}`;
    }
    else {
      return `0 / ${total}`;
    }
  }

  @cacheBlockStatus()
  status(block: Block) {
    return this.wallets.blockStatus(block);
  }

  loadMore() {
    let size = this.wallets.getRecentBlocksSize(this.address);
    this.wallets.setRecentBlocksSize(size + 10, this.address);
    size = this.token.getRecentBlocksSize(this.address);
    this.token.setRecentBlocksSize(size + 10, this.address);
  }

  getAlias(): string {
    if (!this.address) return '';
    return this.alias.alias(this.address);
  }

  dnsValid(): boolean {
    if (!this.address) return false;
    if (!this.alias.dns(this.address)) return false;
    if (!this.alias.verified(this.address)) return false;
    return this.alias.dnsValid(this.address);
  }

  dnsInvalid(): boolean {
    if (!this.address) return false;
    if (!this.alias.dns(this.address)) return false;
    if (!this.alias.verified(this.address)) return false;
    return !this.alias.dnsValid(this.address);
  }

  private formatAmount(type: TokenType, value: U256, decimals: U8, symbol: string): string {
    if (type === TokenType._20) {
      return `${value.toBalanceStr(decimals)} ${symbol}`; 
    } else if (type === TokenType._721) {
      return `1 ${symbol} (${value.toBalanceStr(decimals)})`
    } else {
      return '';
    }
  }

  private queryTokenSymbol(chain: string, address: string, fallback: string = ''): string {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return verified.symbol;
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo && tokenInfo.symbol) {
      return tokenInfo.symbol;
    } else {
      this.token.queryTokenSymbol(chain, address, false);
    }

    return fallback;
  }

}

class AmountShown {
  sign: number = 0;
  amount: string = '0 RAI';
  cache: boolean = true;
}


function cacheBlockInfo() {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;
    descriptor.value = function (info: BlockInfo) {

      const self = this as AccountDetailsComponent;
      let hash = info.block.hash().toHex();
      const cached = self.cache[hash]?.[key];
      if (cached) return cached;
      const result = method.call(self, info);
      if (!self.cache[hash]) self.cache[hash] = {};
      if (result instanceof AmountShown) {
        if (result.cache) {
          self.cache[hash][key] = result;
        }
      } else if (typeof result === 'string') {
        if (result !== 'change') {
          self.cache[hash][key] = result;
        }
      }
      return result;
    };
    return descriptor;
  };
}


function cacheBlockStatus() {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;
    descriptor.value = function (block: Block) {
      const self = this as AccountDetailsComponent;
      let hash = block.hash().toHex();
      const cached = self.cache[hash]?.[key];
      if (cached) return cached;
      const result = method.call(self, block);
      if (!self.cache[hash]) self.cache[hash] = {};
      if (result === BlockStatus.CONFIRMED) {
        self.cache[hash][key] = result;
      }
      return result;
    };
    return descriptor;
  };
}