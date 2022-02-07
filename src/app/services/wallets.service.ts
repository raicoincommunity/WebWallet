import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { v4 as uuid } from 'uuid';
import * as CryptoJS from 'crypto-js';
import { LocalStorageService, StorageKey, AppStorageEvent } from './local-storage.service';
import { UtilService, U8, U64, U256, U128, BlockOpcodeStr, U32, U512, BlockTypeStr, U16, ExtensionTypeStr, ExtensionAliasOpStr } from './util.service';
import { ServerService, ServerState } from './server.service';
import { BlocksService, Receivable, Block, Amount, BlockInfo, TxBlock } from './blocks.service';
import { environment } from '../../environments/environment';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

export { Amount } from './blocks.service';

@Injectable({
  providedIn: 'root'
})
export class WalletsService implements OnDestroy {
  private instanceId = uuid();
  private walletsStorage: WalletsStorage = new WalletsStorage();

  wallets: Wallet[] = [];
  wallet: Wallet | undefined = undefined;

  private unlockedInstances: UnlockedInstance[] = [];
  private timerSync: any = null;
  private selectedAccountSubject = new Subject<string>();
  private showModalSubject = new Subject();

  selectedAccountChanged$ = this.selectedAccountSubject.asObservable();
  showModal$ = this.showModalSubject.asObservable();

  constructor(
    private storage: LocalStorageService,
    private util: UtilService,
    private server: ServerService,
    private blocks: BlocksService) {
    this.loadWallets();
    this.loadUnlockedInstances();

    this.server.state$.subscribe(state => this.processServerState(state));
    this.server.message$.subscribe(message => this.processMessage(message));
    this.storage.changes$.subscribe(event => this.processStorageEvent(event));
    this.timerSync = setInterval(() => this.ongoingSync(), 1000);
  }

  ngOnDestroy() {
    if (this.timerSync) {
      clearInterval(this.timerSync);
      this.timerSync = null;
    }
  }

  creditCost(credit: U16, timestamp?: U64): U128 {
    if (!timestamp) timestamp = new U64(this.server.getTimestamp());
    let price = this.creditPrice(timestamp);
    return price.mul(credit);
  }

  seed(wallet?: Wallet): string {
    if (!wallet) wallet = this.wallet;
    if (!wallet || wallet.locked()) return '';
    return this.util.uint8.toHex(wallet.raw_seed);
  }

  validateAddress(address: string): boolean {
    let account = new U256();
    return account.fromAccountAddress(address);
  }

  recentBlocks(address?: string): BlockInfo[] {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account || !account.synced || !account.created()) return [];
    let result: BlockInfo[] = [];

    let hash: U256 = account.head;
    while (!hash.eq(0)) {
      let block_info = this.blocks.getBlock(hash);
      if (!block_info) break;
      result.push(block_info);
      hash = block_info.block.previous();
    }
    return result;
  }

  setRecentBlocksSize(num: number, address?: string) {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account) return;
    account.recentBlocks = num;
    this.syncRecentBlocks(account);
  }

  getRecentBlocksSize(address?: string): number {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account) return 0;
    return account.recentBlocks;
  }

  credit(address?: string): number {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account || !account.synced || account.headHeight.eq(Account.INVALID_HEIGHT)) return 0;
    let headInfo = this.blocks.getBlock(account.head);
    if (!headInfo) return 0;
    return headInfo.block.credit().toNumber();
  }

  headCounter(address?: string): number {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account || !account.synced || account.headHeight.eq(Account.INVALID_HEIGHT)) return 0;
    let headInfo = this.blocks.getBlock(account.head);
    if (!headInfo) return 0;
    return headInfo.block.counter().toNumber();
  }

  headTimestamp(address?: string): number {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account || !account.synced || account.headHeight.eq(Account.INVALID_HEIGHT)) return 0;
    let headInfo = this.blocks.getBlock(account.head);
    if (!headInfo) return 0;
    return headInfo.block.timestamp().toNumber();
  }

  balance(address?: string): Amount {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account) return { negative: false, value: new U128(0) };
    return account.balance();
  }

  pending(address?: string): Amount {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account) return { negative: false, value: new U128(0) };
    return account.pending();
  }

  receivable(address?: string): Amount {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account) return { negative: false, value: new U128(0) };
    let receivables = this.receivables(account);
    let result: Amount = { negative: false, value: new U128(0)};
    receivables.forEach(r => result.value = result.value.plus(r.amount));
    return result;
  }

  limited(account: Account): boolean {
    if (!account.created()) return false;
    let head = this.blocks.getBlock(account.head);
    if (!head) return false;
    return head.block.counter().gte(new U32(head.block.credit()).mul(20));
  }

  restricted(account: Account): boolean {
    return account.restricted;
  }

  representative(address?: string): string {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account || !account.synced || account.headHeight.eq(Account.INVALID_HEIGHT)) return '';
    let headInfo = this.blocks.getBlock(account.head);
    if (!headInfo || !headInfo.block.hasRepresentative()) return '';
    return headInfo.block.representative().toAccountAddress();
  }

  synchronizing(address?: string): boolean {
    let account = this.selectedAccount();
    if (address) {
      account = this.findAccounts(address)[0];
    }
    if (!account) return false;
    return !(account.subscribed && account.synced);
  }

  blockStatus(block: Block): BlockStatus {
    let account = this.findAccounts(block.account().toAccountAddress())[0];
    if (!account || !account.created()) return BlockStatus.UNKNOWN;

    let block_info = this.blocks.getBlock(block.hash());
    if (!block_info) return BlockStatus.UNKNOWN;

    if (!account.confirmedHeight.eq(Account.INVALID_HEIGHT) && account.confirmedHeight.gte(block.height())) {
      return BlockStatus.CONFIRMED;
    }

    // TODO: fork check
    
    return BlockStatus.PENDING;
  }

  configured(): boolean {
    return !!this.wallet;
  }

  receivables(account?: Account): Receivable[] {
    if (!account) account = this.selectedAccount();
    if (!account) return [];
    return this.blocks.getReceivable(account.storage.address);
  }

  send(destination: string, value: U128, note?: string, subaccount?: string, account?: Account, wallet?: Wallet): WalletOpResult {
    if (!account) {
      account = this.selectedAccount();
    }

    if (!wallet) {
      wallet = this.wallet;
    }
    let errorCode = this.accountActionCheck(account, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) return { errorCode };
    if (account!.balance().value.lt(value)) {
      return { errorCode: WalletErrorCode.BALANCE };
    }

    let extensions:any = null;
    if (note) {
      extensions = [ { type: ExtensionTypeStr.NOTE, value: note } ];
    }

    if (subaccount) {
      const extension = { type: ExtensionTypeStr.SUB_ACCOUNT, value: subaccount }
      if (extensions) {
        extensions.push(extension);
      } else {
        extensions = [ extension ];
      }
    }

    let blockInfo = this.generateSendBlock(account!, wallet!, destination, value, extensions);
    if (blockInfo.errorCode !== WalletErrorCode.SUCCESS || !blockInfo.block) {
      return { errorCode: blockInfo.errorCode };
    }

    let amount: Amount = { negative: true, value };
    this.receiveBlock(blockInfo.block, amount, false, true);

    this.blockPublish(blockInfo.block);

    return { errorCode: WalletErrorCode.SUCCESS, block: blockInfo.block };
  }

  receive(hash: string, account?: Account, wallet?: Wallet): WalletOpResult {
    if (!account) {
      account = this.selectedAccount();
    }

    if (!wallet) {
      wallet = this.wallet;
    }

    let errorCode = this.accountActionCheck(account, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) return { errorCode };

    let receivable = this.blocks.getReceivable(account!.storage.address, hash);
    if (receivable.length === 0) return { errorCode: WalletErrorCode.IGNORED };

    let blockInfo = this.generateReceiveBlock(account!, wallet!, receivable[0]);
    if (blockInfo.errorCode !== WalletErrorCode.SUCCESS || !blockInfo.block) {
      return { errorCode: blockInfo.errorCode };
    }

    let amount: Amount = { negative: false, value: receivable[0].amount };
    this.receiveBlock(blockInfo.block, amount, false, true);

    this.blockPublish(blockInfo.block);

    return { errorCode: WalletErrorCode.SUCCESS };
  }

  change(rep: string, account?: Account, wallet?: Wallet): WalletOpResult {
    if (!account) {
      account = this.selectedAccount();
    }

    if (!wallet) {
      wallet = this.wallet;
    }

    let errorCode = this.accountActionCheck(account, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) return { errorCode };

    let blockInfo = this.generateChangeBlock(account!, wallet!, rep);
    if (blockInfo.errorCode !== WalletErrorCode.SUCCESS || !blockInfo.block) {
      return { errorCode: blockInfo.errorCode };
    }

    let amount: Amount = { negative: false, value: new U128(0) };
    this.receiveBlock(blockInfo.block, amount, false, true);

    this.blockPublish(blockInfo.block);

    return { errorCode: WalletErrorCode.SUCCESS };
  }

  changeExtensions(extensions: { [key: string]: any }[], account?: Account, wallet?: Wallet)
    : WalletOpResult
  {
    if (!account) {
      account = this.selectedAccount();
    }

    if (!wallet) {
      wallet = this.wallet;
    }

    let errorCode = this.accountActionCheck(account, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) return { errorCode };

    if (!account || !account.created()) {
      return { errorCode: WalletErrorCode.NOT_ACTIVATED }
    }

    let blockInfo = this.generateChangeBlock(account!, wallet!, '', extensions);
    if (blockInfo.errorCode !== WalletErrorCode.SUCCESS || !blockInfo.block) {
      return { errorCode: blockInfo.errorCode };
    }

    let amount: Amount = { negative: false, value: new U128(0) };
    this.receiveBlock(blockInfo.block, amount, false, true);

    this.blockPublish(blockInfo.block);

    return { errorCode: WalletErrorCode.SUCCESS };
  }

  setName(name: string, account?: Account, wallet?: Wallet): WalletOpResult {
    if (!account) {
      account = this.selectedAccount();
    }

    if (!wallet) {
      wallet = this.wallet;
    }

    let errorCode = this.accountActionCheck(account, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) return { errorCode };

    const extensions = [
      { type: ExtensionTypeStr.ALIAS, value: { op: ExtensionAliasOpStr.NAME, op_value: name } }
    ];
    let blockInfo = this.generateChangeBlock(account!, wallet!, '', extensions);
    if (blockInfo.errorCode !== WalletErrorCode.SUCCESS || !blockInfo.block) {
      return { errorCode: blockInfo.errorCode };
    }

    let amount: Amount = { negative: false, value: new U128(0) };
    this.receiveBlock(blockInfo.block, amount, false, true);

    this.blockPublish(blockInfo.block);

    return { errorCode: WalletErrorCode.SUCCESS };
  }

  setDns(domain: string, account?: Account, wallet?: Wallet): WalletOpResult {
    if (!account) {
      account = this.selectedAccount();
    }

    if (!wallet) {
      wallet = this.wallet;
    }

    let errorCode = this.accountActionCheck(account, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) return { errorCode };

    const extensions = [
      { type: ExtensionTypeStr.ALIAS, value: { op: ExtensionAliasOpStr.DNS, op_value: domain } }
    ];
    let blockInfo = this.generateChangeBlock(account!, wallet!, '', extensions);
    if (blockInfo.errorCode !== WalletErrorCode.SUCCESS || !blockInfo.block) {
      return { errorCode: blockInfo.errorCode };
    }

    let amount: Amount = { negative: false, value: new U128(0) };
    this.receiveBlock(blockInfo.block, amount, false, true);

    this.blockPublish(blockInfo.block);

    return { errorCode: WalletErrorCode.SUCCESS };
  }

  increaseCredit(credit: U16, account?: Account, wallet?: Wallet): WalletOpResult {
    if (!account) {
      account = this.selectedAccount();
    }

    if (!wallet) {
      wallet = this.wallet;
    }

    let errorCode = this.accountActionCheck(account, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) return { errorCode };

    let blockInfo = this.generateCreditBlock(account!, wallet!, credit);
    if (blockInfo.errorCode !== WalletErrorCode.SUCCESS || !blockInfo.block) {
      return { errorCode: blockInfo.errorCode };
    }

    let value = this.creditPrice(blockInfo.block!.timestamp()).mul(credit);
    let amount: Amount = { negative: true, value };
    this.receiveBlock(blockInfo.block, amount, false, true);

    this.blockPublish(blockInfo.block);

    return { errorCode: WalletErrorCode.SUCCESS };
  }

  selectedWalletIndex(): number {
    return this.wallet ? this.wallet.storage.index : 0;
  }

  selectedWallet(): Wallet | undefined {
    return this.wallet;
  }

  selectWallet(id: string) {
    let wallet = this.findWalletById(id);
    if (!wallet) return;
    this.wallet = wallet;
    this.walletsStorage.selected = wallet.storage.index;
    this.saveWallets();
    this.selectedAccountSubject.next(this.selectedAccountAddress());
  }

  selectAccount(address: string) {
    if (!this.wallet) return;
    let account = this.wallet.findAccount({ address });
    if (!account) return;
    this.wallet.account = account;
    this.wallet.storage.selected = account.storage.index;
    this.saveWallets();
    this.selectedAccountSubject.next(address);
  }

  selectedAccount(): Account | undefined {
    if (!this.wallet) return;
    return this.wallet.findAccount( { index: this.wallet.storage.selected } );
  }

  selectedAccountAddress(): string {
    if (!this.wallet || !this.wallet.account) return '';
    return this.wallet.account.storage.address;
  }

  createWallet(password: string = '', seedHex?: string): WalletOpResult {
    let seed: Uint8Array;
    let errorCode = WalletErrorCode.SUCCESS;
    if (!seedHex) {
      seed = this.util.account.generateSeed();
    } else {
      seed = this.util.hex.toUint8(seedHex);
      if (seed.length !== 32) {
        errorCode = WalletErrorCode.INVALID_SEED;
        return { errorCode };
      }
    }

    let walletId = this.getWalletId(seed);
    let wallet = this.findWalletById(walletId);
    if (wallet) {
      wallet.password = password;
      wallet.raw_seed = seed;
      wallet.storage.seed = this.encrypt(seed, password);
      this.saveWallets();

      return { errorCode, walletId: wallet.storage.id, walletIndex: wallet.storage.index };
    }

    let walletStorage = new WalletStorage(this.newWalletIndex(), WalletType.SEED);
    walletStorage.seed = this.encrypt(seed, password);
    walletStorage.id = walletId;
    let accountIndex = this.newAccountIndex(walletStorage);
    let address = this.getAddress(seed, accountIndex);
    let accountStorage = new AccountStorage(accountIndex, address);
    walletStorage.accounts.push(accountStorage);
    walletStorage.selected = accountStorage.index;
    this.walletsStorage.wallets.push(walletStorage);
    this.walletsStorage.selected = this.walletsStorage.selected || walletStorage.index;

    wallet = new Wallet(walletStorage);
    wallet.password = password;
    wallet.raw_seed = seed;
    let account = new Account(accountStorage);
    wallet.accounts.push(account);
    wallet.account = account;
    this.wallets.push(wallet);

    this.wallet = this.wallet || wallet;

    this.saveWallets();
    this.updateUnlockedInstances(wallet);

    return {
      errorCode,
      seed: this.util.uint8.toHex(seed),
      walletId: walletStorage.id,
      walletIndex: walletStorage.index
    };
  }

  createAccount(): WalletOpResult {
    let errorCode = WalletErrorCode.SUCCESS;
    if (!this.wallet) {
      errorCode = WalletErrorCode.MISS;
      return { errorCode };
    }

    if (this.wallet.raw_seed.length !== 32) {
      errorCode = WalletErrorCode.LOCKED;
      return { errorCode };
    }

    let accountIndex = this.newAccountIndex(this.wallet.storage);
    let address = this.getAddress(this.wallet.raw_seed, accountIndex);
    let accountStorage = new AccountStorage(accountIndex, address);
    this.wallet.storage.accounts.push(accountStorage);
    this.wallet.accounts.push(new Account(accountStorage));
    this.saveWallets();

    return { errorCode, accountAddress: address };
  }

  setWalletPassword(id: string, password: string): WalletOpResult {
    let errorCode = WalletErrorCode.SUCCESS;
    let wallet = this.findWalletById(id);
    if (!wallet) {
      errorCode = WalletErrorCode.MISS;
      return { errorCode };
    }

    if (wallet.raw_seed.length === 0) {
      errorCode = WalletErrorCode.LOCKED;
      return { errorCode };
    }

    wallet.password = password;
    wallet.storage.seed = this.encrypt(wallet.raw_seed, password);
    this.saveWallets();

    return { errorCode }
  }

  lock(wallet?: number | Wallet): WalletOpResult {
    if (typeof wallet === 'undefined') {
      wallet = this.wallet;
    }

    if (typeof wallet === 'number') {
      wallet = this.findWalletByIndex(wallet);
    }

    if (!wallet) {
      return { errorCode: WalletErrorCode.MISS };
    }

    if (wallet.vulnerable()) return { errorCode: WalletErrorCode.VULNERABLE };

    if (wallet.locked()) return { errorCode: WalletErrorCode.IGNORED };

    wallet.password = '';
    wallet.raw_seed = new Uint8Array(0);
    return { errorCode: WalletErrorCode.SUCCESS };
  }

  lockAll(): WalletErrorCode {
    let result = WalletErrorCode.MISS;
    this.wallets.forEach(w => {
      let r = this.lock(w);
      if (r.errorCode === WalletErrorCode.SUCCESS) {
        result = WalletErrorCode.SUCCESS;
      }
    });
    return result;
  }

  unlock(password: string, index?: number): WalletOpResult {
    if (typeof index !== 'number') {
      if (!this.wallet) return { errorCode: WalletErrorCode.MISS };
      index = this.wallet.storage.index;
    }

    let wallet = this.findWalletByIndex(index);
    if (!wallet) return { errorCode: WalletErrorCode.MISS };

    let seed = this.decrypt(wallet.storage.seed, password);
    if (seed.length > 0 && this.getWalletId(seed) === wallet.storage.id) {
      wallet.raw_seed = seed;
      wallet.password = password;
      this.updateUnlockedInstances(wallet);
      return { errorCode: WalletErrorCode.SUCCESS };
    }

    return { errorCode: WalletErrorCode.INVALID_PASSWORD };
  }

  isMyAccount(address: string) {
    for (let i = 0; i < this.wallets.length; ++i) {
      for (let j = 0; j < this.wallets[i].accounts.length; ++j) {
        if (address === this.wallets[i].accounts[j].storage.address) {
          return true;
        }
      }
    }
    return false;
  }

  findAccounts(address: string): Account[] {
    let result: Account[] = [];
    this.forEachAccount(a => {
      if (a.storage.address === address) result.push(a);
    });
    return result;
  }

  accountActionCheck(account?: Account, wallet?: Wallet): WalletErrorCode {
    if (this.server.getState() !== ServerState.CONNECTED) return WalletErrorCode.DISCONNECTED;
    if (!account || !wallet || wallet.accounts.indexOf(account) === -1) return WalletErrorCode.MISS;
    if (wallet.locked()) return WalletErrorCode.LOCKED;
    if (!account.synced) return WalletErrorCode.UNSYNCED;
    if (account.restricted) return WalletErrorCode.RESTRICTED;
    if (account.type.toBlockTypeStr() !== BlockTypeStr.TX_BLOCK && account.created()) {
      return WalletErrorCode.ACCOUNT_TYPE;
    }

    return WalletErrorCode.SUCCESS;
  }

  tryInputPassword() {
    if (!this.selectedWallet()) return;
    this.showModalSubject.next();
  }

  private loadWallets() {
    let storage: WalletsStorage = this.storage.get(StorageKey.WALLETS);
    if (!storage) {
      storage = new WalletsStorage();
    }

    let wallets: Wallet[] = [];
    storage.wallets.forEach(s => {
      let wallet = new Wallet(s);
      let existing = this.findWalletById(wallet.storage.id);
      if (existing) {
        this.mergeWallet(wallet, existing);
      } else {
        wallet.storage.accounts.forEach(s => {
          wallet.accounts.push(new Account(s));
        });
        let account = wallet.findAccount({ index: wallet.storage.selected });
        if (!account && wallet.accounts.length > 0) account = wallet.accounts[0];
        wallet.account = account;
      }

      if (wallet.raw_seed.length === 0) {
        let seed = this.decrypt(wallet.storage.seed, wallet.password);
        if (seed.length > 0 && this.getWalletId(seed) === wallet.storage.id) {
          wallet.raw_seed = seed;
        }
      }
      wallets.push(wallet);
    });

    this.walletsStorage = storage;
    this.wallets = wallets;

    if (this.wallet && (this.wallet = this.findWalletById(this.wallet.storage.id))) {
      return;
    }
    this.wallet = this.findWalletByIndex(this.walletsStorage.selected);
  }

  private loadUnlockedInstances() {
    let unlocked = this.storage.get(StorageKey.UNLOCKED);
    if (!unlocked) {
      unlocked = [];
    }
    this.unlockedInstances = unlocked;

    this.wallets.forEach(w => {
      if (w.locked()) return;
      let instance = this.unlockedInstances.find(x => x.wallet_id === w.storage.id);
      if (!instance) return;
      if (instance.instance_id !== this.instanceId) this.lock(w);
    });
  }


  private processStorageEvent(event: AppStorageEvent) {
    if (event.key === StorageKey.WALLETS) {
      if (!event.self) this.loadWallets();
    }
    else if (event.key === StorageKey.UNLOCKED) {
      if (!event.self) this.loadUnlockedInstances();
    }
    else {
    }
  }

  private newWalletIndex(): number {
    let index = 1;
    while (this.walletsStorage.wallets.find(x => x.index === index)) {
      index++;
    }
    return index;
  }

  private newAccountIndex(storage: WalletStorage): number {
    let index = 0;
    while (storage.accounts.find(x => x.index === index)) {
      index++;
    }
    return index;
  }

  private findWalletsByAccount(account: Account) {
    let result: Wallet[] = [];
    this.wallets.forEach(w => {
      for (let i = 0; i < w.accounts.length; ++i) {
        if (account === w.accounts[i]) {
          result.push(w);
          return;
        }
      }
    });
    return result;
  }

  private findWalletById(id: string): Wallet | undefined {
    return this.wallets.find(x => x.storage.id === id);
  }

  private findWalletByIndex(index: number): Wallet | undefined {
    return this.wallets.find(x => x.storage.index === index);
  }

  private mergeWallet(current: Wallet, existing: Wallet) {
    let seed = this.decrypt(current.storage.seed, existing.password);
    if (seed.length > 0 && this.getWalletId(seed) === current.storage.id) {
      current.raw_seed = existing.raw_seed;
      current.password = existing.password;
    }

    current.storage.accounts.forEach(s => {
      let account = new Account(s);
      let existingAccount = existing.findAccount({ address: s.address });
      if (existingAccount) {
        account.copyOperationData(existingAccount);
      }
      current.accounts.push(account);
    });
    current.account = current.findAccount({ index: current.storage.selected });

    if (existing.account) {
      let address = existing.account.storage.address;
      let account = current.findAccount({ address });
      if (account) current.account = account;
    }
  }

  private getWalletId(seed: Uint8Array): string {
    let public_key = this.util.account.generateAccountKeyPair(seed).publicKey;
    return this.util.uint8.toHex(public_key);
  }

  private getPrivateKey(seed: Uint8Array, index: number): Uint8Array {
    return this.util.account.generatePrivateKey(seed, index);
  }

  private getPublicKey(privateKey: Uint8Array): Uint8Array {
    return this.util.account.generateAccountKeyPair(privateKey).publicKey;
  }

  private getAddress(seed: Uint8Array, index: number) {
    let publicKey = this.getPublicKey(this.getPrivateKey(seed, index));
    return this.util.account.generateAddress(publicKey);
  }

  private encrypt(data: Uint8Array, password: string): string {
    return CryptoJS.AES.encrypt(this.util.uint8.toHex(data), password).toString();
  }

  private decrypt(data: string, password: string): Uint8Array {
    let result = new Uint8Array(0);
    try {
      let decrypted = CryptoJS.AES.decrypt(data, password).toString(CryptoJS.enc.Utf8);
      if (!/^[0-9A-Fa-f]{64}$/.test(decrypted)) {
        return result;
      }

      return this.util.hex.toUint8(decrypted);
    } catch (err) {
      return result;
    }
  }

  private saveWallets() {
    this.storage.set(StorageKey.WALLETS, this.walletsStorage);
  }

  private updateUnlockedInstances(wallet: Wallet) {
    if (wallet.locked()) return;
    let index = this.unlockedInstances.findIndex(i => i.wallet_id === wallet.storage.id);
    if (index !== -1) {
      this.unlockedInstances[index].instance_id = this.instanceId;
    }
    else {
      this.unlockedInstances.push({ wallet_id: wallet.storage.id, instance_id: this.instanceId });
    }
    this.storage.set(StorageKey.UNLOCKED, this.unlockedInstances);
  }

  private sign(wallet: Wallet, address: string, hash: Uint8Array): { error: boolean, signature: string } {
    let error_result = { error: true, signature: '' };
    if (hash.length !== 32 || wallet.locked()) return error_result;

    let account = wallet.findAccount({address: address});
    if (!account) return error_result;

    let privateKey = this.util.account.generatePrivateKey(wallet.raw_seed, account.storage.index);
    let signature = this.util.account.sign(privateKey, hash);
    return {error: false, signature: this.util.uint8.toHex(signature)};
  }


  private forEachAccount(callback: (account: Account, wallet: Wallet) => void) {
    this.wallets.forEach(w => w.accounts.forEach(a => callback(a, w)));
  }

  private accountSubscribe(account: Account, wallet: Wallet) {
    let timestamp = new U64(this.server.getTimestamp());
    let message: any = {
      action: 'account_subscribe',
      account: account.storage.address,
      timestamp: timestamp.toDec(),
    };

    if (!wallet.locked()) {
      let publicKey = new U256();
      publicKey.fromAccountAddress(account.storage.address);
      let buffer = new Uint8Array(U256.SIZE + U64.SIZE);
      buffer.set(publicKey.bytes);
      buffer.set(timestamp.bytes, publicKey.size);
      let hash = this.util.uint8.toHash(buffer);
      let signed = this.sign(wallet, account.storage.address, hash);
      if (!signed.error) {
        message.signature = signed.signature;
      }
    }

    this.server.send(message);
  }

  private accountInfoQuery(account: Account) {
    let message: any = {
      action: 'account_info',
      account: account.storage.address
    }

    this.server.send(message);
  }

  private accountForksQuery(account: Account) {
    let message: any = {
      action: 'account_forks',
      account: account.storage.address
    }

    this.server.send(message);
  }

  private blockQueryByPrevious(address: string, height: U64, previous: U256) {
    let message: any = {
      action: 'block_query',
      account: address,
      height: height.toDec(),
      previous: previous.toHex(),
      request_id: address
    };
    this.server.send(message);
  }

  private blockQueryByHash(hash: U256) {
    let message: any = {
      action: 'block_query',
      hash: hash.toHex()
    };
    this.server.send(message);
  }

  private blockPublish(block: Block) {
    let message: any = {
      action: 'block_publish',
      account: block.account().toAccountAddress(),
      block: block.json()
    };
    this.server.send(message);
  }

  public receivablesQuery(account: Account) {
    let message: any = {
      action: 'receivables',
      account: account.storage.address,
      type: 'confirmed',
      count: new U64(50).toDec()
    }

    this.server.send(message);
  }

  private syncHeadBlock(account: Account) {
    if (account.headHeight.eq(Account.INVALID_HEIGHT)) {
      this.blockQueryByPrevious(account.storage.address, new U64(0), new U256(0));
    }
    else {
      this.blockQueryByPrevious(account.storage.address, account.headHeight.plus(1), account.head);
    }
  }

  private syncConfirmedBlock(account: Account) {
    if (account.confirmedHeight.eq(account.headHeight)
       || account.headHeight.eq(Account.INVALID_HEIGHT)) {
      return;
    }

    if (account.confirmedHeight.eq(Account.INVALID_HEIGHT)) {
      this.blockQueryByPrevious(account.storage.address, new U64(0), new U256(0));
    }
    else {
      this.blockQueryByPrevious(account.storage.address, account.confirmedHeight.plus(1), account.confirmed);
    }
  }

  private syncRecentBlocks(account: Account) {
    if (!account.created()) return;
    if (account.headHeight.minus(account.tailHeight).plus(1).gte(account.recentBlocks)) return;
    let block_info = this.blocks.getBlock(account.tail);
    if (!block_info) return;
    this.blockQueryByHash(block_info.block.previous());
  }

  private syncAccount(account: Account, wallet: Wallet) {
    this.accountSubscribe(account, wallet);
    if (!account.subscribed) return;

    this.accountInfoQuery(account);

    if (account.synced) {
      this.syncHeadBlock(account);
      this.syncConfirmedBlock(account);
      this.receivablesQuery(account);
      this.accountForksQuery(account);
      this.syncRecentBlocks(account);
    }
  }

  private ongoingSync(force?: boolean) {
    if (this.server.getState() !== ServerState.CONNECTED) return;

    this.forEachAccount((a, w) => {
      let now = window.performance.now();
      if (a.nextSyncAt > now && !force) return;

      this.syncAccount(a, w);

      if (a.synced && a.subscribed) {
        a.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } 
      else {
        a.nextSyncAt = now + 1500;
      }
    });
  }


  private processServerState(state: ServerState) {
    if (state === ServerState.CONNECTED) {
      this.ongoingSync(true);
    }
    else {
    }
  }

  private processMessage(message: any) {
    if (message.service) return;
    if (message.ack) {
      switch (message.ack) {
        case 'account_info':
          this.processAccountInfoAck(message);
          break;
        case 'account_subscribe':
          this.processAccountSubscribeAck(message);
          break;
        case 'block_query':
          this.processBlockQueryAck(message);
          break;
        case 'receivables':
          this.processReceivablesAck(message);
          break;
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
        case 'block_append':
          this.processBlockAppendNotify(message);
          break;
        case 'block_confirm':
          this.processBlockConfirmNotify(message);
          break;
        case 'receivable_info':
          this.processReceivableInfoNotify(message);
          break;
        case 'account_unsubscribe':
          this.processAccountUnsubscribeNotify(message);
          break;
        default:
          break;
        }
    }
    else {
    }
  }

  private processAccountSubscribeAck(message: any) {
    if (!message.account) return;
    let accounts = this.findAccounts(message.account);
    accounts.forEach(a => {
      if (message.error) {
        a.subscribed = false;
        a.nextSyncAt = 0;
      }
      else {
        a.subscribed = true
      }
    });
  }

  private processAccountInfoAck(message: any) {
    if (!message.account) {
      console.log(`processAccountInfoAck: account is missing, message=`, message);
      return;
    }
    let accounts = this.findAccounts(message.account);

    if (message.error) {
      if (message.error !== 'The account does not exist') {
        console.log('processAccountInfoAck: error ack message=', message);
        return;
      }

      accounts.forEach(a => {
        if (a.subscribed) a.synced = true;
        this.pushBlocks(a);
      });
      return;
    }

    accounts.forEach(a => {
      a.forks = parseInt(message.forks);
      a.restricted = message.restricted === "true" ? true : false;
      if (a.synced) {
        this.pushBlocks(a, new U256(message.head, 16));
        return;
      }

      let type = new U8();
      let error = type.fromBlockTypeString(message.type);
      if (error) {
        console.log('processAccountInfoAck: failed to parse type, message=', message);
        return;
      }

      let parsed = this.blocks.jsonToBlock(message.head_block);
      error = parsed.error;
      let headBlock = parsed.block;
      if (error || !headBlock) {
        console.log('processAccountInfoAck: failed to parse head block=', message.head_block);
        return;
      }
      let amount = this.jsonToAmount(headBlock.opcode(), message, 'head_block_amount');
      if (amount.error || !amount.amount) {
        console.log('processAccountInfoAck: failed to parse head block amount, message=', message);
        return;
      }

      let confirmedBlock: Block | undefined;
      let confirmedHeight = Account.INVALID_HEIGHT;
      if (message.confirmed_height) {
        confirmedHeight = new U64(message.confirmed_height);
        if (!message.confirmed_block) {
          console.log(`processAccountInfoAck: confirmed block is missing`);
          return;
        }

        parsed = this.blocks.jsonToBlock(message.confirmed_block);
        error = parsed.error;
        confirmedBlock = parsed.block;
        if (error || !confirmedBlock) {
          console.log('processAccountInfoAck: failed to parse confirmed block=', message.confirmed_block);
          return;
        }
      }

      a.type = type;
      a.headHeight = new U64(message.head_height);
      a.head = new U256(message.head, 16);
      a.balanceHead = headBlock.balance();
      a.confirmedHeight = confirmedHeight;
      if (confirmedBlock) {
        a.confirmed = confirmedBlock.hash();
        a.balanceConfirmed = confirmedBlock.balance();
      }
      else {
        a.confirmed = Account.INVALID_HASH;
        a.balanceConfirmed = new U128(0);
      }

      if (a.headHeight.eq(a.confirmedHeight) && a.subscribed) {
        a.synced = true;
        a.tail = a.head;
        a.tailHeight = a.headHeight;
        this.blocks.putBlock(a.head, headBlock, amount.amount);
      }
    });
  }

  private processBlockQueryAck(message: any) {
    if (message.error) {
      console.log('processBlockQueryAck: error message=', message);
      return;
    }

    let block: Block | undefined;
    if (message.block) {
      let parsed = this.blocks.jsonToBlock(message.block);
      if (parsed.error || !parsed.block) {
        console.log('processBlockQueryAck: failed to parse block, message=', message);
        return;
      }
      block = parsed.block;
    }

    let amount: Amount | undefined;
    if (block && message.amount) {
      let parsed = this.jsonToAmount(block.opcode(), message);
      if (parsed.error || !parsed.amount) {
        console.log('processBlockQueryAck: failed to parse block amount, message=', message);
        return;
      }
      amount = parsed.amount;
    }

    let confirmed = false;
    if (message.confirmed === 'true') confirmed = true;

    if (message.request_id) {
      let account = new U256();
      let error = account.fromAccountAddress(message.request_id);
      if (error) {
        console.log('processBlockQueryAck: failed to parse request_id, message=', message);
        return;
      }

      if (!message.status) {
        console.log('processBlockQueryAck: failed to get status, message=', message);
        return;
      }

      if (message.status === 'success') {
        if (!block || !amount) return;
        this.receiveBlock(block, amount, confirmed);
      }
      else if (message.status === 'fork') {
        if (!block || !confirmed || !amount) return;
        this.receiveBlock(block, amount, confirmed);
      }
      else {
      }
    }
    else {
      if (!block || !amount) return;
      this.receiveBlock(block, amount);
    }
  }

  private processReceivablesAck(message: any) {
    if (!message.account) {
      console.log(`processReceivablesAck: account is missing, message=`, message);
      return;
    }
    if (!message.receivables) return;
    let account = new U256();
    let error = account.fromAccountAddress(message.account);
    if (error) {
      console.log(`processReceivablesAck: invalid account, message=`, message);
      return;
    }

    let accounts = this.findAccounts(message.account);
    if (accounts.length === 0 || !accounts[0].synced) return;

    let total = new U128(0);
    message.receivables.forEach((r: any) => {
      let receivable = new Receivable();
      let error = receivable.fromJson(r);
      if (error) {
        console.log(`processReceivablesAck: failed to parse receivable from json, receivalbe=`, r);
        return;
      }
      if (receivable.timestamp.gt(this.server.getTimestamp() + 30)) return;
      if (this.blocks.receivableExists(account, receivable)) return;
      if (this.blocks.getReceiving(receivable.hash)) return;
      this.blocks.putReceivable(account, receivable);
      total = total.plus(receivable.amount);
    });

    accounts.forEach(a => {
      if (!a.synced) return;
      a.balanceReceivable = a.balanceReceivable.plus(total);
    });
  }

  private processBlockAppendNotify(message: any) {
    if (!message.block) {
      console.log('processBlockAppendNotify: error message=', message);
      return;
    }

    let parsed = this.blocks.jsonToBlock(message.block);
    if (parsed.error || !parsed.block) {
      console.log('processBlockAppendNotify: failed to parse block, message=', message);
      return;
    }
    let block = parsed.block;

    if (block.height().gt(0)) {
      let previousInfo = this.blocks.getBlock(block.previous());
      if (previousInfo) {
        let previous = previousInfo.block;
        let amount: Amount = { negative: false, value: new U128(0) };
        if (previous.balance().gt(block.balance())) {
          amount.negative = true;
          amount.value = previous.balance().minus(block.balance());
        }
        else {
          amount.negative = false;
          amount.value = block.balance().minus(previous.balance());
        }
        this.receiveBlock(block, amount);
        return;
      }
    }

    let accounts = this.findAccounts(block.account().toAccountAddress());
    accounts.forEach(a => this.syncHeadBlock(a));
  }

  private processBlockConfirmNotify(message: any) {
    if (!message.block) {
      console.log('processBlockConfirmNotify: error message=', message);
      return;
    }

    let parsed = this.blocks.jsonToBlock(message.block);
    if (parsed.error || !parsed.block) {
      console.log('processBlockConfirmNotify: failed to parse block, message=', message);
      return;
    }
    let block = parsed.block;

    if (block.height().gt(0)) {
      let previousInfo = this.blocks.getBlock(block.previous());
      if (previousInfo) {
        let previous = previousInfo.block;
        let amount: Amount = { negative: false, value: new U128(0) };
        if (previous.balance().gt(block.balance())) {
          amount.negative = true;
          amount.value = previous.balance().minus(block.balance());
        }
        else {
          amount.negative = false;
          amount.value = block.balance().minus(previous.balance());
        }
        this.receiveBlock(block, amount, true);
        return;
      }
    }

    let accounts = this.findAccounts(block.account().toAccountAddress());
    accounts.forEach(a => this.syncConfirmedBlock(a));
  }

  private processReceivableInfoNotify(message: any) {
    if (!message.account) {
      console.log(`processReceivableInfoNotify: account is missing, message=`, message);
      return;
    }
    let accounts = this.findAccounts(message.account);
    if (accounts.length === 0 || !accounts[0].synced) return;
    let account = new U256();
    account.fromAccountAddress(message.account);

    let receivable = new Receivable();
    let error = receivable.fromJson(message);
    if (error) {
      console.log(`processReceivableInfoNotify: failed to parse receivable, message=`, message);
      return;
    }

    if (receivable.timestamp.gt(this.server.getTimestamp() + 30)) return;
    if (this.blocks.receivableExists(account, receivable)) return;
    if (this.blocks.getReceiving(receivable.hash)) return;
    this.blocks.putReceivable(account, receivable);

    accounts.forEach(a => {
      if (!a.synced) return;
      a.balanceReceivable = a.balanceReceivable.plus(receivable.amount);
    });
  }

  private processAccountUnsubscribeNotify(message: any) {
    if (!message.account) {
      console.log(`processAccountUnsubscribeNotify: account is missing, message=`, message);
      return;
    }

    let accounts = this.findAccounts(message.account);
    accounts.forEach (a => {
      a.subscribed = false;
      a.nextSyncAt = 0;
    });
  }

  private receiveBlock(block: Block, amount: Amount, confirmed?: boolean, local: boolean = false) {
    let accounts = this.findAccounts(block.account().toAccountAddress());
    accounts.forEach (a => {
      if (!a.synced) return;
      this.prependBlock(a, block, amount);
      this.appendBlock(a, block, amount, local);
      if (confirmed) {
        this.confirmBlock(a, block);
      }
    });
  }

  private appendBlock(account: Account, block: Block, amount: Amount, local: boolean = false) {
    if (account.headHeight.eq(Account.INVALID_HEIGHT)) {
      if (!block.height().eq(0)) {
        this.syncHeadBlock(account);
        return;
      }
      account.tailHeight = account.headHeight = block.height();
      account.tail = account.head = block.hash();
      account.balanceHead = block.balance();
      account.type = block.type();
    }
    else {
      let expected_height = account.headHeight.plus(1);
      if (block.height().gt(expected_height)) {
        this.syncHeadBlock(account);
        return;
      }
      else if (block.height().eq(expected_height)) {
        if (!block.previous().eq(account.head)) return;
        account.headHeight = block.height();
        account.head = block.hash();
        account.balanceHead = block.balance();
      }
      else {
        return;
      }
    }

    this.blocks.putBlock(account.head, block, amount);
    if (block.opcode().toBlockOpcodeStr() === BlockOpcodeStr.RECEIVE) {
      this.blocks.putReceiving(block.link());
      let receivable = this.blocks.getReceivable(account.storage.address, block.link());
      if (receivable.length > 0) {
        this.blocks.delReceivable(block.account(), block.link());
        account.balanceReceivable = account.balanceReceivable.minus(receivable[0].amount);
      }
    }
    this.syncHeadBlock(account);

    if (!local) {
      let wallets = this.findWalletsByAccount(account);
      wallets.forEach(w => this.lock(w));
    }
  }

  private confirmBlock(account: Account, block: Block) {
    let existing = this.blocks.getBlock(block.hash());
    if (!existing) {
      this.accountRollback(account);
      this.syncHeadBlock(account);
      return;
    }

    if (!account.confirmedHeight.eq(Account.INVALID_HEIGHT)
      && block.height().lte(account.confirmedHeight))
    {
      return;
    }

    let block_l = block;
    while (true) {
      if (block_l.opcode().toBlockOpcodeStr() === BlockOpcodeStr.RECEIVE) {
        this.blocks.delReceiving(block_l.link());
      }

      if (block_l.height().eq(account.tailHeight)
        || block_l.height().eq(0)
        || block_l.height().eq(account.confirmedHeight.plus(1))) {
          break;
      }

      const blockInfo = this.blocks.getBlock(block_l.previous());
      if (!blockInfo) break;
      block_l = blockInfo.block;
    }

    account.confirmed = block.hash();
    account.confirmedHeight = block.height();
    account.balanceConfirmed = block.balance();

    this.syncConfirmedBlock(account);
  }

  private prependBlock(account: Account, block: Block, amount: Amount) {
    if (account.tailHeight.eq(0) || account.tailHeight.eq(Account.INVALID_HEIGHT)) return;
    if (account.headHeight.minus(account.tailHeight).plus(1).gte(account.recentBlocks)) return;
    let tail_block = this.blocks.getBlock(account.tail);
    if (!tail_block) {
      console.log('prependBlock: failed to get tail block, hash=', account.tail.toHex());
      return;
    }
    let hash = block.hash();
    if (!tail_block.block.previous().eq(hash)) return;
    this.blocks.putBlock(hash, block, amount, account.tail);
    account.tail = hash;
    account.tailHeight = block.height();

    if (account.tailHeight.gt(0) && account.headHeight.minus(account.tailHeight).plus(1).lt(account.recentBlocks)) {
      this.blockQueryByHash(block.previous());
    }
  }

  private accountRollback(account: Account) {
    while (!account.head.eq(account.confirmed) && !account.headHeight.eq(Account.INVALID_HEIGHT)) {
      let head_info = this.blocks.getBlock(account.head);
      if (!head_info) {
        console.log('accountRollback: failed to get head block, hash', account.head);
        return;
      }
      if (head_info.block.opcode().toBlockOpcodeStr() === BlockOpcodeStr.RECEIVE) {
        this.blocks.delReceiving(head_info.block.link());
      }
      this.blocks.delBlock(account.head);

      if (head_info.block.height().eq(0)) {
        account.tail = account.head = Account.INVALID_HASH;
        account.tailHeight = account.headHeight = Account.INVALID_HEIGHT;
        account.balanceHead = new U128(0);
      }
      else {
        let previous = head_info.block.previous();
        let previous_info = this.blocks.getBlock(previous);
        if (!previous_info) {
          console.log('accountRollback: failed to get previous block, hash', previous);
          return;
        }
        account.head = previous;
        account.headHeight = previous_info.block.height();
        account.balanceHead = previous_info.block.balance();
      }
    }
  }

  private jsonToAmount(blockOpcode: U8, json: any, key?: string): { error: boolean, amount?: Amount } {
    let error = true;
    if (!key) key = 'amount';
    if (!json[key]) return { error };
    let value = new U128(json[key]);
    let op = blockOpcode.toBlockOpcodeStr();
    let negative: boolean = op === BlockOpcodeStr.SEND
                         || op === BlockOpcodeStr.CREDIT 
                         || op === BlockOpcodeStr.DESTROY;
    return { error: false, amount: { negative, value } }
  }

  private generateReceiveBlock(account: Account, wallet: Wallet, receivable: Receivable): { errorCode: WalletErrorCode, block?: Block } {
    let json: any = {};
    if (account.created()) {
      let previousInfo = this.blocks.getBlock(account.head);
      if (!previousInfo) return { errorCode: WalletErrorCode.MISS };
      let previous = previousInfo.block;

      let now = this.server.getTimestamp();
      let previousTimestamp = previous.timestamp().toNumber();
      let timestamp = now > previousTimestamp ? now : previousTimestamp;
      if (timestamp < receivable.timestamp.toNumber()) {
        timestamp = receivable.timestamp.toNumber();
      }
      if (timestamp > now + 60) return { errorCode: WalletErrorCode.TIMESTAMP };

      
      let counter = new U32(1);
      if (previous.timestamp().sameDay(timestamp)) {
        counter = previous.counter().plus(1);
      }
      if (counter.gt(new U32(previous.credit()).mul(20))) {
        return { errorCode: WalletErrorCode.CREDIT };
      }

      json.type = BlockTypeStr.TX_BLOCK;
      json.opcode = BlockOpcodeStr.RECEIVE;
      json.credit = previous.credit().toDec();
      json.counter = counter.toDec();
      json.timestamp = new U64(timestamp).toDec();
      json.height = previous.height().plus(1).toDec();
      json.account = account.storage.address;
      json.previous = previous.hash().toHex();
      json.representative = previous.representative().toAccountAddress();
      json.balance = previous.balance().plus(receivable.amount).toDec();
      json.link = receivable.hash.toHex();
      json.extensions_length = '0';
      json.extensions = '';
      json.signature = new U512().toHex();
    }
    else {
      let now = this.server.getTimestamp();
      let timestamp = receivable.timestamp.toNumber();
      if (now > timestamp) timestamp = now;
      if (timestamp > now + 60) return { errorCode: WalletErrorCode.TIMESTAMP };
      let creditCost = this.creditPrice(new U64(timestamp));
      if (creditCost.gt(receivable.amount)) return { errorCode: WalletErrorCode.RECEIVABLE_AMOUNT };
      let balance = receivable.amount.minus(creditCost);

      let reps = environment.default_representatives;
      let rep = reps[Math.floor(Math.random() * reps.length)];

      json.type = BlockTypeStr.TX_BLOCK;
      json.opcode = BlockOpcodeStr.RECEIVE;
      json.credit = '1';
      json.counter = '1';
      json.timestamp = new U64(timestamp).toDec();
      json.height = '0';
      json.account = account.storage.address;
      json.previous = new U256(0).toHex();
      json.representative = rep;
      json.balance = balance.toDec();
      json.link = receivable.hash.toHex();
      json.extensions_length = '0';
      json.extensions = '';
      json.signature = new U512().toHex();
    }

    let block = new TxBlock();
    let error = block.fromJson(json);
    if (error) return { errorCode: WalletErrorCode.UNEXPECTED };
    let signature = this.sign(wallet, account.storage.address, block.hash().bytes);
    if (signature.error) return { errorCode: WalletErrorCode.UNEXPECTED };
    block.setSignature(signature.signature);
    error = this.blocks.verifySignature(block);
    if (error) return { errorCode: WalletErrorCode.UNEXPECTED };

    return { errorCode: WalletErrorCode.SUCCESS, block };
  }

  private generateSendBlock(account: Account, wallet: Wallet, destination: string,
    amount: U128, note?: any): { errorCode: WalletErrorCode, block?: Block } {
    let previousInfo = this.blocks.getBlock(account.head);
    if (!previousInfo) return { errorCode: WalletErrorCode.MISS };
    let previous = previousInfo.block;

    let now = this.server.getTimestamp();
    let previousTimestamp = previous.timestamp().toNumber();
    let timestamp = now > previousTimestamp ? now : previousTimestamp;
    if (timestamp > now + 60) return { errorCode: WalletErrorCode.TIMESTAMP };


    let counter = new U32(1);
    if (previous.timestamp().sameDay(timestamp)) {
      counter = previous.counter().plus(1);
    }
    if (counter.gt(new U32(previous.credit()).mul(20))) {
      return { errorCode: WalletErrorCode.CREDIT };
    }

    let json: any = {};
    json.type = BlockTypeStr.TX_BLOCK;
    json.opcode = BlockOpcodeStr.SEND;
    json.credit = previous.credit().toDec();
    json.counter = counter.toDec();
    json.timestamp = new U64(timestamp).toDec();
    json.height = previous.height().plus(1).toDec();
    json.account = account.storage.address;
    json.previous = previous.hash().toHex();
    json.representative = previous.representative().toAccountAddress();
    json.balance = previous.balance().minus(amount).toDec();
    json.link = destination;
    if (note) {
      json.extensions = note;
    }
    else {
      json.extensions_length = '0';
      json.extensions = '';  
    }
    json.signature = new U512().toHex();


    let block = new TxBlock();
    let error = block.fromJson(json);
    if (error) return { errorCode: WalletErrorCode.UNEXPECTED };
    let signature = this.sign(wallet, account.storage.address, block.hash().bytes);
    if (signature.error) return { errorCode: WalletErrorCode.UNEXPECTED };
    block.setSignature(signature.signature);
    error = this.blocks.verifySignature(block);
    if (error) return { errorCode: WalletErrorCode.UNEXPECTED };

    return { errorCode: WalletErrorCode.SUCCESS, block };
  }

  private generateChangeBlock(account: Account, wallet: Wallet, rep: string, extensions?: any): { errorCode: WalletErrorCode, block?: Block } {
    let previousInfo = this.blocks.getBlock(account.head);
    if (!previousInfo) return { errorCode: WalletErrorCode.MISS };
    let previous = previousInfo.block;

    if (!rep) {
      rep = previous.representative().toAccountAddress();
    }

    let now = this.server.getTimestamp();
    let previousTimestamp = previous.timestamp().toNumber();
    let timestamp = now > previousTimestamp ? now : previousTimestamp;
    if (timestamp > now + 60) return { errorCode: WalletErrorCode.TIMESTAMP };

    let counter = new U32(1);
    if (previous.timestamp().sameDay(timestamp)) {
      counter = previous.counter().plus(1);
    }
    if (counter.gt(new U32(previous.credit()).mul(20))) {
      return { errorCode: WalletErrorCode.CREDIT };
    }

    let json: any = {};
    json.type = BlockTypeStr.TX_BLOCK;
    json.opcode = BlockOpcodeStr.CHANGE;
    json.credit = previous.credit().toDec();
    json.counter = counter.toDec();
    json.timestamp = new U64(timestamp).toDec();
    json.height = previous.height().plus(1).toDec();
    json.account = account.storage.address;
    json.previous = previous.hash().toHex();
    json.representative = rep;
    json.balance = previous.balance().toDec();
    json.link = new U256(0).toHex();
    if (extensions) {
      json.extensions = extensions;
    }
    else {
      json.extensions_length = '0';
      json.extensions = '';  
    }
    json.signature = new U512().toHex();


    let block = new TxBlock();
    let error = block.fromJson(json);
    if (error) return { errorCode: WalletErrorCode.CONSTRUCT_BLOCK };
    let signature = this.sign(wallet, account.storage.address, block.hash().bytes);
    if (signature.error) return { errorCode: WalletErrorCode.UNEXPECTED };
    block.setSignature(signature.signature);
    error = this.blocks.verifySignature(block);
    if (error) return { errorCode: WalletErrorCode.UNEXPECTED };

    return { errorCode: WalletErrorCode.SUCCESS, block };
  }

  private generateCreditBlock(account: Account, wallet: Wallet, increase: U16): { errorCode: WalletErrorCode, block?: Block } {
    let previousInfo = this.blocks.getBlock(account.head);
    if (!previousInfo) return { errorCode: WalletErrorCode.MISS };
    let previous = previousInfo.block;

    if (increase.eq(0)) return { errorCode: WalletErrorCode.UNEXPECTED };

    let credit = previous.credit().plus(increase);
    if (credit.lt(increase)) return { errorCode: WalletErrorCode.CREDIT_MAX };

    let now = this.server.getTimestamp();
    let previousTimestamp = previous.timestamp().toNumber();
    let timestamp = now > previousTimestamp ? now : previousTimestamp;
    if (timestamp > now + 60) return { errorCode: WalletErrorCode.TIMESTAMP };


    let counter = new U32(1);
    if (previous.timestamp().sameDay(timestamp)) {
      counter = previous.counter().plus(1);
    }
    if (counter.gt(new U32(credit).mul(20))) {
      return { errorCode: WalletErrorCode.CREDIT };
    }

    let cost = this.creditPrice(new U64(timestamp)).mul(increase);
    if (cost.gt(previous.balance())) return { errorCode: WalletErrorCode.BALANCE };
    let balance = previous.balance().minus(cost);

    let json: any = {};
    json.type = BlockTypeStr.TX_BLOCK;
    json.opcode = BlockOpcodeStr.CREDIT;
    json.credit = credit.toDec();
    json.counter = counter.toDec();
    json.timestamp = new U64(timestamp).toDec();
    json.height = previous.height().plus(1).toDec();
    json.account = account.storage.address;
    json.previous = previous.hash().toHex();
    json.representative = previous.representative().toAccountAddress();
    json.balance = balance.toDec();
    json.link = new U256(0).toHex();
    json.extensions_length = '0';
    json.extensions = '';
    json.signature = new U512().toHex();


    let block = new TxBlock();
    let error = block.fromJson(json);
    if (error) return { errorCode: WalletErrorCode.UNEXPECTED };
    let signature = this.sign(wallet, account.storage.address, block.hash().bytes);
    if (signature.error) return { errorCode: WalletErrorCode.UNEXPECTED };
    block.setSignature(signature.signature);
    error = this.blocks.verifySignature(block);
    if (error) return { errorCode: WalletErrorCode.UNEXPECTED };

    return { errorCode: WalletErrorCode.SUCCESS, block };
  }

  public creditPrice(timestamp: U64): U128 {
    let epoch = new U64(environment.epoch_timestamp);
    let rates = [
      1000, 1000, 1000, 1000,
       900,  800,  700,  600,
       500,  500,  400,  400,
       300,  300,  200,  200,
       100,  100,  100,  100,
        90,   80,   70,   60,
        50,   50,   40,   40,
        30,   30,   20,   20,
        10,   10,   10,   10,
         9,    8,    7,    6,
         5,    5,    4,    4,
         3,    3,    2,    2
    ];
    let unit = new U128(1000000);
    let quarter = new U64(7776000);
    let maxQuarters = 48;

    if (timestamp.lt(epoch)) return new U128(0);
    if (timestamp.gte(epoch.plus(quarter.mul(maxQuarters)))) return unit;
    let index = timestamp.minus(epoch).idiv(quarter).toNumber();
    return unit.mul(rates[index]);
  }

  private pushBlocks(account: Account, hash?: U256) {
    if (!hash) {
      hash = account.tail;
    }
    else {
      let blockInfo = this.blocks.getBlock(hash);
      if (!blockInfo) return;
      hash = blockInfo.successor;
    }

    while (true) {
      let blockInfo = this.blocks.getBlock(hash);
      if (!blockInfo) return;
      this.blockPublish(blockInfo.block);
      hash = blockInfo.successor;
    }
  }

}

export class Account {
  static readonly INVALID_HEIGHT = U64.max();
  static readonly INVALID_HASH = new U256(0);

  storage: AccountStorage;
  type: U8 = new U8(0);
  headHeight: U64 = Account.INVALID_HEIGHT;
  head: U256 = Account.INVALID_HASH;
  confirmedHeight: U64 = Account.INVALID_HEIGHT;
  confirmed: U256 = Account.INVALID_HASH;
  tailHeight: U64 = Account.INVALID_HEIGHT;
  tail: U256 = Account.INVALID_HASH;
  balanceHead: U128 = new U128(0);
  balanceConfirmed: U128 = new U128(0);
  balanceReceivable: U128 = new U128(0);
  forks: number = 0;
  restricted: boolean = false;

  synced: boolean = false;
  subscribed: boolean = false;
  nextSyncAt: number = 0;
  recentBlocks: number = 0;

  copyOperationData(other: Account) {
    this.type = other.type;
    this.headHeight = other.headHeight;
    this.head = other.head;
    this.confirmedHeight = other.confirmedHeight;
    this.confirmed = other.confirmed;
    this.tailHeight = other.tailHeight;
    this.tail = other.tail;
    this.balanceHead = other.balanceHead;
    this.balanceConfirmed = other.balanceConfirmed;
    this.balanceReceivable = other.balanceReceivable;
    this.forks = other.forks;
    this.restricted = other.restricted;
    this.synced = other.synced;
    this.subscribed = other.subscribed;
    this.nextSyncAt = other.nextSyncAt;
    this.recentBlocks = other.recentBlocks;
  }

  constructor(storage: AccountStorage) {
    this.storage = storage;
  }

  address(): string {
    return this.storage.address;
  }

  index(): number {
    return this.storage.index;
  }

  created(): boolean {
    return !this.headHeight.eq(Account.INVALID_HEIGHT);
  }

  balance(): Amount {
    return { negative: false, value: this.balanceConfirmed }
  }

  pending(): Amount {
    if (this.balanceHead.gte(this.balanceConfirmed)) {
      return { negative: false, value: this.balanceHead.minus(this.balanceConfirmed) };
    }
    else {
      return { negative: true, value: this.balanceConfirmed.minus(this.balanceHead) };
    }
  }

  receivable(): Amount {
    return { negative: false, value: this.balanceReceivable };
  }
}

export class Wallet {
  password: string = '';
  raw_seed: Uint8Array = new Uint8Array(0);
  storage: WalletStorage;
  accounts: Account[] = [];
  account: Account | undefined;

  constructor(storage: WalletStorage) {
    this.storage = storage;
  }

  id(): string {
    return this.storage.id;
  }

  index(): number {
    return this.storage.index;
  }

  accountCount(): number {
    return this.accounts.length;
  }

  balance(): Amount {
    let result: Amount = { negative: false,  value: new U128(0) };
    this.accounts.forEach(a => result.value = result.value.plus(a.balance().value));
    return result;
  }

  receivable(): Amount {
    let result: Amount = { negative: false,  value: new U128(0) };
    this.accounts.forEach(a => result.value = result.value.plus(a.receivable().value));
    return result;
  }

  findAccountAddress(index: number): string {
    let account = this.storage.accounts.find(a => a.index === index);
    return account ? account.address : '';
  }

  findAccount(by: { address?: string, index?: number }): Account | undefined {
    if (by.address) {
      return this.accounts.find(a => a.storage.address === by.address);
    }

    if (typeof by.index === 'number') {
      return this.accounts.find(a => a.storage.index === by.index);
    }

    return undefined;
  }

  locked(): boolean {
    return this.raw_seed.length !== 32;
  }

  vulnerable(): boolean {
    return !this.password && !this.locked();
  }
}

class AccountStorage {
  index: number;
  address: string;

  constructor(index: number, address: string) {
    this.index = index;
    this.address = address;
  }
}

export enum WalletType {
  SEED = 'seed',
}

export enum WalletErrorCode {
  SUCCESS = 'Success',
  INVALID_SEED = 'Invalid seed',
  LOCKED = 'The wallet is locked',
  MISS = 'The wallet or account doesn\'t exist',
  VULNERABLE = 'The wallet password is empty',
  INVALID_PASSWORD = 'Invalid password',
  UNSYNCED = 'The account is synchronizing, please try later',
  IGNORED = 'The operation is ignored',
  TIMESTAMP = 'Invalid timestamp',
  CREDIT = 'Account daily transactions limit exceeded',
  RESTRICTED = 'The account is restricted',
  ACCOUNT_TYPE = 'Unsupported account type',
  UNEXPECTED = 'Unexpected error',
  RECEIVABLE_AMOUNT = 'Receivable amount less than credit price',
  DISCONNECTED = 'Not connected to server yet',
  BALANCE = 'Not enough balance',
  CREDIT_MAX = 'Account\'s max allowed daily transactions limit is 1310700',
  NOT_ACTIVATED = 'The account is not activated, please deposit some Raicoin to activate it',
  CONSTRUCT_BLOCK = 'Failed to contruct block'
}
marker('Success');
marker('Invalid seed');
marker('The wallet is locked');
marker('The wallet or account doesn\'t exist');
marker('The wallet password is empty');
marker('Invalid password');
marker('The account is synchronizing, please try later');
marker('The operation is ignored');
marker('Invalid timestamp');
marker('Account daily transactions limit exceeded');
marker('The account is restricted');
marker('Unsupported account type');
marker('Unexpected error');
marker('Receivable amount less than credit price');
marker('Not connected to server yet');
marker('Not enough balance');
marker('Account\'s max allowed daily transactions limit is 1310700');
marker('The account is not activated, please deposit some Raicoin to activate it');

export enum BlockStatus {
  PENDING = 'pending',
  FORK = 'fork',
  CONFIRMED = 'confirmed',
  UNKNOWN = 'unknown'
}
marker('pending');
marker('fork');
marker('confirmed');
marker('unknown');

export interface WalletOpResult {
  errorCode: WalletErrorCode;
  seed?: string;
  walletId?: string;
  walletIndex?: number;
  accountAddress?: string;
  block?: Block
}

class WalletStorage {
  index: number;
  type: WalletType;
  seed: string = '';
  id: string = '';
  selected: number = 0;
  accounts: AccountStorage[] = [];

  constructor(index: number, type: WalletType) {
    this.index = index;
    this.type = type;
  }
}

class WalletsStorage {
  static readonly CURRENT_VERSION = 1;

  version: number = WalletsStorage.CURRENT_VERSION;
  selected: number = 0;
  wallets: WalletStorage[] = [];
}


interface UnlockedInstance {
  wallet_id: string;
  instance_id: string;
}