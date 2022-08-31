import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { U128, U64, U256, Chain, ChainStr, ChainHelper, ZX, TokenType } from './util.service';
import { Web3Service } from './web3.service';
import { TypedDataUtils, TypedMessage, MessageTypes, SignTypedDataVersion } from '@metamask/eth-sig-util';
import { UnmapInfo } from './token.service';

@Injectable({
  providedIn: 'root'
})
export class ValidatorService implements OnDestroy {
  private SERVICE = 'validator';
  private chains: { [chain: number]: CrossChainInfo } = {};
  private transfers: { [account: string]: { [height: number] : TransferSignatures } } = {};
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

  syncChainHeadHeight(chainStr: ChainStr) {
    this.addChain(chainStr);
    this.queryChainHeadHeight(chainStr);
  }

  chainInfo(chainStr: ChainStr): CrossChainInfo | undefined {
    const chain = ChainHelper.toChain(chainStr);
    if (chain === Chain.INVALID) return undefined;
    const info = this.chains[chain];
    if (!info || !info.valid) return undefined;
    return info;
  }

  signUnmap(unmap: UnmapInfo) {
    const account = unmap.account;
    const height = unmap.height;
    if (this.transfers[account]?.[height]) return;
    if (!this.transfers[account]) {
      this.transfers[account] = {};
    }
    const transfer = new TransferSignatures(CrossChainOp.UNMAP, unmap.chainId as Chain, unmap);
    this.transfers[account][height] = transfer;
    this.syncTransferSignatures(transfer);
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
      this.subscribe(+chain);
      this.queryChainInfo(+chain);
      info.nextSyncAt = now + 20000;
    }

    for (let account in this.transfers) {
      for (let height in this.transfers[account]) {
        this.syncTransferSignatures(this.transfers[account][height]);
      }
    }

  }

  private subscribe(chain: number | string) {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      filters: [{ key: 'chain_id', value: `${chain}` }],
      request_id: `chain:${chain}`
    };
    this.server.send(message);
  }

  queryChainInfo(chain: number | string) {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const message: any = {
      action: 'chain_info',
      service: this.SERVICE,
      chain_id: `${chain}`,
    };
    this.server.send(message);
  }

  private queryChainHeadHeight(chain: number | string) {
    if (typeof chain === 'string') {
      chain = ChainHelper.toChain(chain);
    }
    const message: any = {
      action: 'chain_head_height',
      service: this.SERVICE,
      chain_id: `${chain}`,
    };
    this.server.send(message);
  }

  private syncTransferSignatures(transfer: TransferSignatures) {
    const now = window.performance.now();
    if (now < transfer.lastQueryAt + transfer.round * 3000) return;
    const info = this.chains[transfer.chain];
    if (!info || !info.valid) return;

    let percent = transfer.percent(info.totalWeight, info.validators);
    if (percent > 51) return;

    percent = this.roundToPercent(transfer.round);
    const weight = info.topWeight(percent);
    for (let i of info.sortedValidators) {
      if (transfer.signatures[i.validator]) continue;
      if (i.weight.lt(weight) || i.weight.eq(0)) break;
      this.requestSignTransfer(transfer.chain, transfer.account, transfer.height,
        i.validator, transfer.op);
    }

    transfer.round++;
    transfer.lastQueryAt = now;
  }

  private requestSignTransfer(chain: number | string, account: string, height: number,
    validator: string, op: CrossChainOp) {
      if (typeof chain === 'string') {
        chain = ChainHelper.toChain(chain);
      }
      const message: any = {
      action: 'sign_transfer',
      service: this.SERVICE,
      chain_id: `${chain}`,
      account,
      height: `${height}`,
      validator,
      operation: op,
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
        case 'chain_head_height':
          this.processChainHeadHeight(message);
          break;
        case 'sign_transfer':
          this.processSignTransfer(message);
          break
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
    if (error)
    {
      console.error('processChainInfo: parse message failed', message);
      return;
    }
    info.updateNextSyncAt();
    for (let account in this.transfers) {
      for (let height in this.transfers[account]) {
        this.transfers[account][height].clearPercentCache(chain);
      }
    }
  }

  private processChainHeadHeight(message: any) {
    if (message.error || !message.chain_id) return;
    const chain = +message.chain_id;
    const info = this.chains[chain];
    if (!info) return;
    info.height = +message.height;
  }

  private processSignTransfer(message: any) {
    if (message.error || message.pending || !message.signature) return;
    const op = message.operation as CrossChainOp;
    const sig = new CrossChainSignature();
    const error = sig.fromJson(message);
    if (error) return;
    const account = message.account;
    const height = +message.height;
    if (!this.transfers[account]?.[height]) return;
    const transfer = this.transfers[account][height];


    // todo:
  }

  private roundToPercent(round: number) {
    if (round < 3) {
      return 55;
    } else if (round < 6) {
      return 75;
    } else if (round < 9) {
      return 95;
    } else {
      return 98;
    }
  }

  private verifyTransferSignature(transfer: TransferSignatures, sig: CrossChainSignature): boolean {
    if (ChainHelper.isEvmChain(transfer.chain)) {
      return this.verifyEvmTransferSignature(transfer, sig);
    } else {
      console.error(`ValidatorService::verifyTransferSignature: unsupported chain=${transfer.chain}`);
      return true;
    }
  }

  private verifyEvmTransferSignature(transfer: TransferSignatures, sig: CrossChainSignature): boolean {
    if (transfer.op === CrossChainOp.UNMAP) {
      const data = transfer.data as UnmapInfo;
      if (ChainHelper.isNative(data.chain, data.addressRaw)) {
        EIP712.unmapETH(transfer)
        // todo:
      }
      else if (data.type === TokenType._20) {
        // todo:
      } else if (data.type === TokenType._721) {

      }
    } else {
      console.error(`ValidatorService::verifyTransferSignature: unknow op=${transfer.op}`);
      return true;
    }
  }

}

class CrossChainValidator {
  validator: string = '';
  validatorAccount: string = '';
  signer: string = '';
  weight: U256 = U256.zero();
  gasPrice: U256 = U256.zero();
  lastSubmit: number = 0;
  epoch: number = 0;

  fromJson(json: any): boolean {
    try {
      this.validator = json.validator;
      const raw = new U256(this.validator, 16);
      this.validatorAccount = raw.toAccountAddress();
      this.signer = json.signer;
      this.weight = new U256(json.weight);
      if (json.gas_price) {
        this.gasPrice = new U256(json.gas_price);
      }
      if (json.last_submit) {
        this.lastSubmit = +json.last_submit;
      }
      if (json.epoch) {
        this.epoch = +json.epoch;
      }
      return false;
    }
    catch (e) {
      console.log(`CrossChainValidator.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}

type CrossChainValidators = { [validator: string]: CrossChainValidator };
export class CrossChainInfo {
  chain: Chain = Chain.INVALID;
  confirmations: number = 0;
  fee: U256 = new U256(0);
  height: number = 0;
  valid: boolean = false;
  totalWeight: U256 = U256.zero();
  genesisValidator: CrossChainValidator = new CrossChainValidator();
  validators: CrossChainValidators = {};
  sortedValidators: CrossChainValidator[] = [];

  // local data
  chainStr: ChainStr = ChainStr.INVALID;
  subscribed: boolean = false;
  nextSyncAt: number = 0;
  topWeightCaches: { [percent: number]: U256} = {};

  fromJson(json: any): boolean {
    try {
      this.valid = false;
      this.chain = +json.chain_id;
      this.confirmations = +this.confirmations;
      this.fee = new U256(json.fee);
      this.height = +json.height;
      this.totalWeight = new U256(json.total_weight);
      this.genesisValidator.validator = json.genesis_validator;
      const raw = new U256(this.genesisValidator.validator, 16);
      this.genesisValidator.validatorAccount = raw.toAccountAddress();
      this.genesisValidator.signer = json.genesis_signer;
      this.genesisValidator.weight = new U256(json.genesis_weight);

      this.validators = {};
      this.sortedValidators = [];
      this.validators[this.genesisValidator.validator] = this.genesisValidator;
      this.sortedValidators.push(this.genesisValidator);
      if (json.validators) {
        for (let i of json.validators) {
          const validator = new CrossChainValidator();
          const error = validator.fromJson(i);
          if (error) return true;
          this.validators[validator.validator] = validator;
          this.sortedValidators.push(validator);
        }
        this.sortedValidators.sort((x, y) => {
          if (x.weight.gt(y.weight)) return -1;
          if (y.weight.gt(x.weight)) return 1;
          return 0;
        });
      }
      this.topWeightCaches = {};
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

  topWeight(percent: number): U256 {
    if (this.totalWeight.eq(0)) return U256.max();
    if (this.topWeightCaches[percent]) {
      this.topWeightCaches[percent];
    }

    let sum = U256.zero();
    let threshold = this.totalWeight.mul(percent).idiv(100);
    for (let i of this.sortedValidators) {
      sum = sum.plus(i.weight);
      if (sum.gt(threshold)) {
        this.topWeightCaches[percent] = i.weight;
        return i.weight;
      }
    }
    this.topWeightCaches[percent] = U256.zero();
    return U256.zero();
  }

}

export enum CrossChainOp {
  NONE = '',
  MAP = 'map',
  UNMAP = 'unmap',
  WRAP = 'wrap',
  UNWRAP = 'unwrap',
}

class CrossChainSignature {
  validator: string = '';
  signer: string = '';
  signature: string = '';

  fromJson(json: any): boolean {
    this.validator = json.validator;
    this.signer = json.signer;
    this.signature = json.signatue;
    return !(this.validator && this.signer && this.signature);
  }
}

type TransferSignatureData = UnmapInfo;

class TransferSignatures {
  op: CrossChainOp = CrossChainOp.NONE;
  account: string = '';
  height: number = 0;
  chain: Chain = Chain.INVALID;
  data?: TransferSignatureData;
  signatures: { [validator: string]: CrossChainSignature } = {};
  percentCache?: number;
  round: number = 0;
  lastQueryAt: number = 0;

  constructor(op: CrossChainOp, chain: Chain, data: TransferSignatureData) {
    this.op = op;
    this.account = data.account;
    this.height = data.height;
    this.chain = chain;
    this.data = data;
  }

  percent(total: U256, validators: CrossChainValidators): number {
    if (this.percentCache !== undefined) {
      return this.percentCache;
    }

    if (total.eq(0)) {
      return 0;
    }

    let sum = new U256(0);
    for (let i in this.signatures) {
      if (!validators[i]) continue;
      sum = sum.plus(validators[i].weight);
    }
    
    this.percentCache = sum.mul(100).idiv(total).toNumber();
    if (this.percentCache > 100) {
      this.percentCache = 100;
    }
    return this.percentCache!;
  }

  clearPercentCache(chain: Chain) {
    if (this.chain === chain) {
      this.percentCache = undefined;
    }
  }
}

export class EIP712 {
  static common(chain: string): any {
    const chainId = ChainHelper.toEvmChain(chain);
    if (chainId === undefined) {
      throw new Error(`EIP712::common: failed to convert to evm chain, chain=${chain}`);
    }
    const core = Web3Service.getCoreContractAddress(chain as ChainStr);
    if (!core) {
      throw new Error(`EIP712::common: failed to get core contract, chain=${chain}`);
    }
    return {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
      },
      domain: {
        name: 'Raicoin',
        version: '1.0',
        chainId,
        verifyingContract: core,
      }
    };
  }

  static hashTypedData(data: any): string {
    const message = data as TypedMessage<MessageTypes>;
    const hash = TypedDataUtils.eip712Hash(message, SignTypedDataVersion.V4).toString('hex');
    console.log(`[DEBUG] EIP712::hashTypedData, hash=${ZX + hash}`);
    return ZX + hash;
  }

  static unmapERC20(chain: string, token: string, sender: string, recipient: string,
    txnHash: string, txnHeight: string, share: string): any {
      const data = EIP712.common(chain);
      data.types.UnmapERC20 = [
        { name: "token", type: "address" },
        { name: "sender", type: "bytes32"},
        { name: "recipient", type: "address"},
        { name: "txnHash", type: "bytes32"},
        { name: "txnHeight", type: "uint64"},
        { name: "share", type: "uint256"},
      ];
      data.primaryType = 'UnmapERC20';
      data.message =  {
        token,
        sender,
        recipient,
        txnHash,
        txnHeight,
        share,
    }
    return data;
  }

  static unmapETH(chain: string, sender: string, recipient: string, txnHash: string,
    txnHeight: string, amount: string): any {
    const data = EIP712.common(chain);
    data.types.UnmapETH = [
      { name: "sender", type: "bytes32" },
      { name: "recipient", type: "address" },
      { name: "txnHash", type: "bytes32" },
      { name: "txnHeight", type: "uint64" },
      { name: "amount", type: "uint256" },
    ];
    data.primaryType = 'UnmapETH';
    data.message = {
      sender,
      recipient,
      txnHash,
      txnHeight,
      amount,
    }
    return data;
  }

  static unmapERC721(chain: string, token: string, sender: string, recipient: string,
    txnHash: string, txnHeight: string, tokenId: string): any {
      const data = EIP712.common(chain);
      data.types.UnmapERC721 = [
        { name: "token", type: "address" },
        { name: "sender", type: "bytes32"},
        { name: "recipient", type: "address"},
        { name: "txnHash", type: "bytes32"},
        { name: "txnHeight", type: "uint64"},
        { name: "tokenId", type: "uint256"},
      ];
      data.primaryType = 'UnmapERC721';
      data.message =  {
        token,
        sender,
        recipient,
        txnHash,
        txnHeight,
        tokenId,
    }
    return data;
  }
}