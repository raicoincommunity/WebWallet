import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { U128, U64, U256, Chain, ChainStr, ChainHelper } from './util.service';

@Injectable({
  providedIn: 'root'
})
export class ValidatorService implements OnDestroy {
  private SERVICE = 'validator';
  private chains: { [chain: number]: CrossChainInfo } = {};
  private timerSync: any = null;

  constructor(
    private server: ServerService
  ) {
    this.server.state$.subscribe(state => this.processServerState(state));
    this.server.message$.subscribe(message => this.processMessage(message));
    this.timerSync = setInterval(() => this.ongoingSync(), 3000);
  }

  ngOnDestroy() {
    if (this.timerSync) {
      clearInterval(this.timerSync);
      this.timerSync = null;
      console.log('FaucetService destroyed.')
    }
  }

  addChain(chainStr: ChainStr) {
    const chain = ChainHelper.toChain(chainStr);
    if (chain === Chain.INVALID) return;
    let info = this.chains[chain];
    if (info) return;
    info = new CrossChainInfo();
    info.chainStr = chainStr;
    this.chains[chain] = info;
    this.ongoingSync();
  }

  chainInfo(chainStr: ChainStr): CrossChainInfo | undefined {
    const chain = ChainHelper.toChain(chainStr);
    if (chain === Chain.INVALID) return undefined;
    const info = this.chains[chain];
    if (!info || !info.valid) return undefined;
    return info;
  }

  private processServerState(state: ServerState) {
    if (state === ServerState.CONNECTED) {
      this.ongoingSync(true);
    }
    else {
    }
  }

  private ongoingSync(force?: boolean) {
    if (this.server.getState() !== ServerState.CONNECTED) return;
    const now = window.performance.now();

    for (let chain in this.chains) {
      const info = this.chains[chain];
      if (!force && info.nextSyncAt > now) continue;
      this.subscribe(chain);
      this.queryChainInfo(chain);
      info.nextSyncAt = now + 20000;
    }
  }

  private subscribe(chain: string) {
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      filters: [{ key: 'chain_id', value: chain }],
      request_id: `chain:${chain}`
    };
    this.server.send(message);
  }

  queryChainInfo(chain: string) {
    const message: any = {
      action: 'chain_info',
      service: this.SERVICE,
      chain_id: chain
    };
    this.server.send(message);
  }

  private processMessage(message: any) {
    if (!message.service || message.service !== this.SERVICE) return;

    if (message.ack) {
      switch (message.ack) {
        case 'service_subscribe':
          this.processServiceSubscribe(message);
          break;
        case 'chain_info':
          this.processChainInfo(message);
          break;
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
        case 'chain_info':
          this.processChainInfo(message);
          break;
        default:
          break;
        }
    }
  }

  private processServiceSubscribe(message: any) {
    if (!message.request_id) {
      console.log('processServiceSubscribeAck: request_id missing');
      return;
    }

    const id = message.request_id;
    if (id.startsWith('chain:')) {
      const chain = +id.substring(6);
      const info = this.chains[chain];
      if (!info) return;
      if (message.error) {
        info.subscribed = false;
        info.nextSyncAt = 0;
      } else {
        info.subscribed = true;
      }
    }
  }

  private processChainInfo(message: any) {
    if (message.error || !message.chain_id) return;
    const chain = +message.chain_id;
    const info = this.chains[chain];
    if (!info) return;
    const error = info.fromJson(message);
    info.updateNextSyncAt();
    if (error)
    {
      console.error('processChainInfo: parse message failed', message);
      return;
    }
    // todo:
  }

}

export class CrossChainInfo {
  chain: Chain = Chain.INVALID;
  confirmations: number = 0;
  fee: U256 = new U256(0);
  height: number = 0;
  valid: boolean = false;

  // local data
  chainStr: ChainStr = ChainStr.INVALID;
  subscribed: boolean = false;
  nextSyncAt: number = 0;

  fromJson(json: any): boolean {
    try {
      this.valid = false;
      this.chain = +json.chain_id;
      this.confirmations = +this.confirmations;
      this.fee = new U256(json.fee);
      this.height = +json.height;
      this.valid = true;
      return false;
    }
    catch (e) {
      console.log(`CrossChainInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  updateNextSyncAt() {
    const now = window.performance.now();
    if (this.subscribed && this.valid) {
      this.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
    } else {
      this.nextSyncAt = now + 5000;
    }
  }

}