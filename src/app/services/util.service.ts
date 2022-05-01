import { Injectable } from '@angular/core';
import * as blake from 'blakejs';
import { BigNumber } from 'bignumber.js'
import { environment } from '../../environments/environment';
import { toChecksumAddress } from 'web3-utils'
import { sharedKey} from '@stablelib/x25519'
import * as CryptoJS from 'crypto-js';

const nacl = window['nacl'];
const account_letters = '13456789abcdefghijkmnopqrstuwxyz'.split('');

@Injectable({
  providedIn: 'root'
})
export class UtilService {
  constructor() { }

  uint8 = {
    toUint4: uint8ToUint4,
    toHex: uint8ToHex,
    toHash: uint8ToHash,
  };

  uint5 = {
    toString: uint5ToString,
  };

  uint4 = {
    toUint5: uint4ToUint5,
  };

  dec = {
    toHex: decToHex,
  };

  hex = {
    toUint8: hexToUint8,
  };

  account = {
    generateSeed: generateSeed,
    generatePrivateKey: generatePrivateKey,
    generateAccountKeyPair: generateAccountKeyPair,
    generateAddress: generateAddress,
    generateShareKey: generateShareKey,
    sign: sign,
    verify: verify
  };

  other = {
    shortAddress: shortAddress
  };
}

function uint8ToUint4(uint8: Uint8Array): Uint8Array {
  const uint4 = new Uint8Array(uint8.length * 2);

  for (let i = 0; i < uint8.length; i++) {
    uint4[i*2] = uint8[i] / 16 | 0;
    uint4[i*2+1] = uint8[i] % 16;
  }

  return uint4;
}

function uint8ToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    let aux = bytes[i].toString(16).toUpperCase();
    if(aux.length == 1) {
      aux = '0'+aux;
    }
    hex += aux;
  }

  return hex;
}

function uint8ToHash(bytes: Uint8Array): Uint8Array {
  const ctx = blake.blake2bInit(32);
  blake.blake2bUpdate(ctx, bytes);
  return blake.blake2bFinal(ctx);
}

function uint5ToString(uint5: Uint8Array): string {
  const letters = account_letters;
  let string = "";

  for (let i = 0; i < uint5.length; i++) {
    string += letters[uint5[i]];
  }

  return string;
}

function uint5ToUint4(uint5: Uint8Array): Uint8Array {
  let length = Math.ceil(uint5.length / 4 * 5);
  let uint4 = new Uint8Array(length);
  for (let i = 0; i < uint5.length; i++) {
    let j = i * 5 / 4 | 0;
    let bit = i * 5 % 4;
    let u4Index = uint4.length - 1 - j;
    let u5Index = uint5.length - 1 - i;
    uint4[u4Index] |= (uint5[u5Index] & (0x1f >>> (1 + bit))) << bit;
    uint4[u4Index - 1] = uint5[u5Index] >>> (4 - bit);
  }
  return uint4;
}

function uint4ToUint5(uint4: Uint8Array): Uint8Array {
  let length = Math.ceil(uint4.length * 4 / 5);
  let uint5 = new Uint8Array(length);
  for (let i = 0; i < uint4.length; i++) {
    let left = 5 - (i * 4) % 5;
    let use = left > 4 ? 4 : left;
    let m = uint4[uint4.length - 1 -i];
    let index = (i * 4) / 5 | 0;
    uint5[index] |= (m & (0xf >>> (4 - use))) << (5 - left);
    if (use < 4)
    {
      uint5[index + 1] |= m >>> use;
    }
  }
  return uint5.reverse();
}

function uint4ToUint8(uint4: Uint8Array): Uint8Array {
  let length = Math.ceil(uint4.length / 2);
  let uint8 = new Uint8Array(length);
  for (let i = 0; i < uint4.length; ++i) {
    let u4Index = uint4.length - 1 -i;
    let u8Index = uint8.length - 1 - (i / 2 | 0);
    uint8[u8Index] |= i % 2 ? uint4[u4Index] << 4 : uint4[u4Index];
  }

  return uint8;
}

function decToHex(dec: number, bytes: number = 0): string {
  let decArray: string[] = dec.toString().split('');
  let sum: number[] = [];
  let hex: string = '';
  let hexArray:string[] = [];
  let i: number;
  let s: number;

  while(decArray.length) {
    s = parseInt(decArray.shift()!);
    for(i = 0; s || i < sum.length; i++)
    {
      s += (sum[i] || 0) * 10
      sum[i] = s % 16
      s = (s - sum[i]) / 16
    }
  }
  while(sum.length) {
    hexArray.push(sum.pop()!.toString(16));
  }

  hex = hexArray.join('');

  if(hex.length % 2) {
    hex = "0" + hex;
  }

  if(bytes > hex.length / 2) {
    let diff = bytes - hex.length / 2;
    for(let j = 0; j < diff; j++) {
      hex = "00" + hex;
    }
  }

  return hex;
}

function hexToUint8(hex: string): Uint8Array {
  if (hex.length % 2)
  {
    return new Uint8Array(0);
  }

  const length = hex.length / 2;
  const uint8 = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    uint8[i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  return uint8;
}

function boolStrToUint8(bool: string): Uint8Array {
  const uint8 = new Uint8Array(1);
  if (bool === "true") {
    uint8[0] = 1;
    return uint8;
  } else if (bool === "false") {
    uint8[0] = 0;
    return uint8;
  } else {
    return new Uint8Array();
  }
}

function uint8ToBoolStr(array: Uint8Array, offset: number): string {
  if (array.length <= offset) return '';
  if (array[offset] === 0) {
    return 'false';
  } else if (array[offset] === 1) {
    return 'true';
  } else {
    return '';
  }
}

function generateSeed(): Uint8Array {
  return nacl.randomBytes(32);
}

function generatePrivateKey(seed: Uint8Array, index: number): Uint8Array {
  const ctx = blake.blake2bInit(32);
  blake.blake2bUpdate(ctx, seed);
  blake.blake2bUpdate(ctx, hexToUint8(decToHex(index, 4)));
  return blake.blake2bFinal(ctx);
}

function generateAccountKeyPair(privateKey: Uint8Array) {
  return nacl.sign.keyPair.fromSecretKey(privateKey);
}

function generateAddress(publicKey: Uint8Array, prefix: string = 'rai') {

  const raw = uint5ToString(uint4ToUint5(uint8ToUint4(publicKey)));
  const checksumUint8 = blake.blake2b(publicKey, null, 5).reverse();
  const checksum = uint5ToString(uint4ToUint5(uint8ToUint4(checksumUint8)));

  return `${prefix}_${raw}${checksum}`;
}

function generateShareKey(privateKey: Uint8Array, height: U64): Uint8Array {
  let ctx = blake.blake2bInit(32);
  blake.blake2bUpdate(ctx, privateKey);
  blake.blake2bUpdate(ctx, height.bytes);
  const first = blake.blake2bFinal(ctx);
  ctx = blake.blake2bInit(32);
  blake.blake2bUpdate(ctx, first);
  return blake.blake2bFinal(ctx);
}

function sign(privateKey: Uint8Array, hash: Uint8Array): Uint8Array {
  return nacl.sign.detached(hash, privateKey);
}

function verify(hash: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean {
  return !nacl.sign.detached.verify(hash, signature, publicKey);
}

function array_crop (array: any) {
  let length = array.length - 1;
  let cropped_array = new Uint8Array(length);
  for (let i = 0; i < length; i++)
    cropped_array[i] = array[i+1];
  return cropped_array;
}

function equal_arrays (array1: any, array2: any) {
  for (let i = 0; i < array1.length; i++) {
    if (array1[i] != array2[i])	return false;
  }
  return true;
}

function stringToUint5(str: string) {
  let letters = account_letters;
  let length = str.length;
  let str_array = str.split('');
  let uint5 = new Uint8Array(length);
  for (let i = 0; i < length; i++)	uint5[i] = letters.indexOf(str_array[i]);
  return uint5;
}

function shortAddress(addr: string, reserve: number = 5): string {
  if (addr.startsWith('rai_') && addr.length  == 64) {
    return addr.substr(0, reserve + 4) + '...' + addr.substr(-reserve);
  }
  return addr;
}

function shortEthAddress(addr: string, reserve: number = 4): string {
  if (addr.startsWith('0x') && addr.length  == 42) {
    return addr.substr(0, reserve + 2) + '...' + addr.substr(-reserve);
  }
  return addr;
}

export type Uall = U8 | U16 | U32 | U64 | U128 | U256 | U512;
export type UintFrom = number | string | BigNumber | Uall;

class UintHelper {
  static create(size: number, value: UintFrom, base?: number): Uall {
    switch (size) {
      case 1 : return new U8(value, base, false);
      case 2 : return new U16(value, base, false);
      case 4 : return new U32(value, base, false);
      case 8 : return new U64(value, base, false);
      case 16: return new U128(value, base, false);
      case 32: return new U256(value, base, false);
      case 64: return new U512(value, base, false);
      default: return new U512(value, base, false);
    }
  }

  static borrow(size: number): BigNumber {
    return new BigNumber(2).pow(size * 8);
  }

  static max(size: number): Uall {
    return UintHelper.create(size, UintHelper.borrow(size).minus(1));
  }
}

class Uint {
  readonly size: number = 0;
  bytes: Uint8Array;

  constructor(from: UintFrom, base: number | undefined, size: number, check: boolean = true) {
    let n: BigNumber;
    if (from instanceof Uint) {
      if (check &&  size < from.size) {
        throw new Error(`Uint constructor: size narrowing, from=${from.size}, to=${size}`);
      }
      n = from.toBigNumber();
    }
    else {
      n = new BigNumber(from, base);
    }

    if (!n.isInteger() || n.isNegative() || size === 0) {
      throw new Error(`Uint constructor: bad parameter, from=${from}, base=${base}, size=${size}`);
    }
  
    let a = new Uint8Array(size);
    for (let i = size - 1; i >= 0; --i) {
      let r = n.mod(256);
      a[i] = r.toNumber();
      n = n.minus(r).div(256);
      if (n.isZero()) {
        break;
      }
    }
  
    if (check && !n.isZero()) {
      throw new Error(`Uint constructor: overflow, from=${from}, base=${base}, size=${size}`);
    }
  
    this.bytes = a;
  }

  fromArray(array: Uint8Array, offset: number): boolean {
    let error = true;
    if (offset > array.length - this.size) return error;
    this.bytes = array.slice(offset, offset + this.size);
    return false;
  }

  toBigNumber(): BigNumber {
    let b = new BigNumber(0);
    for (let i = 0; i < this.bytes.length; ++i) {
      b = b.mul(256).plus(this.bytes[i]);
    }
    return b;
  }

  toNumber(): number {
    return this.toBigNumber().toNumber();
  }

  toHex(): string {
    return uint8ToHex(this.bytes);
  }

  toDec(): string {
    return this.toBigNumber().toFixed();
  }

  toFormat(): string {
    return this.toBigNumber().toFormat(0, 1);
  }

  plus(other: UintFrom, base?: number): Uall {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    let sum = this.toBigNumber().plus(other);
    return UintHelper.create(this.size, sum);
  }

  minus(other: UintFrom, base?: number): Uall {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    let left = this.toBigNumber();
    if (left.lessThan(other)) {
      left = left.plus(UintHelper.borrow(this.size));
    }
    return UintHelper.create(this.size, left.minus(other));
  }

  mod(other: UintFrom, base?: number): Uall {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return UintHelper.create(this.size, this.toBigNumber().mod(other));
  }

  eq(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().eq(other);
  }

  gt(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().gt(other);
  }

  gte(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().gte(other);
  }

  lt(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().lt(other);
  }

  lte(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    return this.toBigNumber().lte(other);
  }

  mul(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    let sum = this.toBigNumber().mul(other);
    return UintHelper.create(this.size, sum);
  }

  idiv(other: UintFrom, base?: number) {
    other = UintHelper.create(this.size, other, base).toBigNumber();
    let quotient = this.toBigNumber().dividedToIntegerBy(other);
    return UintHelper.create(this.size, quotient);
  }
}

export enum BlockType {
  INVALID     = 0,
  TX_BLOCK    = 1,  // Transaction Block
  REP_BLOCK   = 2,  // Representive Block
  AD_BLOCK    = 3,  // Airdrop Block
}

export enum BlockTypeStr {
  INVALID     = 'invalid',
  TX_BLOCK    = 'transaction',
  REP_BLOCK   = 'representive',
  AD_BLOCK    = 'airdrop',
}

type BlockTypeMap = [BlockType, BlockTypeStr];
const blockTypeMaps: BlockTypeMap[] = [
  [BlockType.TX_BLOCK, BlockTypeStr.TX_BLOCK],
  [BlockType.REP_BLOCK, BlockTypeStr.REP_BLOCK],
  [BlockType.AD_BLOCK, BlockTypeStr.AD_BLOCK]
]

export enum BlockOpcode {
  INVALID = 0,
  SEND    = 1,
  RECEIVE = 2,
  CHANGE  = 3,
  CREDIT  = 4,
  REWARD  = 5,
  DESTROY = 6,
}

export enum BlockOpcodeStr {
  INVALID = 'invalid',
  SEND    = 'send',
  RECEIVE = 'receive',
  CHANGE  = 'change',
  CREDIT  = 'credit',
  REWARD  = 'reward',
  DESTROY = 'destroy',
}

type BlockOpcodeMap = [BlockOpcode, BlockOpcodeStr];
const blockOpcodeMaps: BlockOpcodeMap[] = [
  [BlockOpcode.SEND, BlockOpcodeStr.SEND],
  [BlockOpcode.RECEIVE, BlockOpcodeStr.RECEIVE],
  [BlockOpcode.CHANGE, BlockOpcodeStr.CHANGE],
  [BlockOpcode.CREDIT, BlockOpcodeStr.CREDIT],
  [BlockOpcode.REWARD, BlockOpcodeStr.REWARD],
  [BlockOpcode.DESTROY, BlockOpcodeStr.DESTROY],
]

export class U8 extends Uint {
  static readonly SIZE = 1;
  static _MAX: U8 | undefined;
  static max(): U8 {
    if (!U8._MAX) {
      U8._MAX = UintHelper.max(U8.SIZE) as U8;
    }
    return U8._MAX;
  }
  
  readonly size = U8.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U8.SIZE, check);
  }

  fromBlockTypeString(str: string): boolean {
    let error = true;
    let map = blockTypeMaps.find(x => str === x[1]);
    if (!map) return error;
    let n: number = map[0];

    this.bytes = new U8(n).bytes;
    return false;
  }

  toBlockTypeStr(): string {
    let n = this.toNumber();
    let map = blockTypeMaps.find(x => n === x[0]);
    if (map) return map[1];
    return BlockTypeStr.INVALID;
  }

  fromBlockOpcodeStr(str: string): boolean {
    let error = true;
    let map = blockOpcodeMaps.find(x => str === x[1]);
    if (!map) return error;
    let n: number = map[0];

    this.bytes = new U8(n).bytes;
    return false;
  }

  toBlockOpcodeStr(): string {
    let n = this.toNumber();
    let map = blockOpcodeMaps.find(x => n === x[0]);
    if (map) return map[1];
    return BlockOpcodeStr.INVALID;
  }

  isSend(): boolean {
    return this.toNumber() === BlockOpcode.SEND;
  }
}

export class U16 extends Uint {
  static readonly SIZE = 2;
  static _MAX: U16 | undefined;
  static max(): U16 {
    if (!U16._MAX) {
      U16._MAX = UintHelper.max(U16.SIZE) as U16;
    }
    return U16._MAX;
  }

  readonly size = U16.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U16.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U16 {
    return super.plus(other, base) as U16;
  }

  minus(other: UintFrom, base?: number): U16 {
    return super.minus(other, base) as U16;
  }

  fromExtensionTypeStr(str: string): boolean {
    let map = extensionTypeMaps.find(x => str === x[1]);
    if (map) {
      this.bytes = new U16(map[0]).bytes;
      return false;
    }
    
    try {
      this.bytes = new U16(str).bytes;
      return false;
    }
    catch (e) {
      return true;
    }
  }

  toExtensionTypeStr(): string {
    let n = this.toNumber();
    let map = extensionTypeMaps.find(x => n === x[0]);
    if (map) return map[1];
    return this.toDec();
  }
}

export class U32 extends Uint {
  static readonly SIZE = 4;
  static _MAX: U32 | undefined;
  static max(): U32 {
    if (!U32._MAX) {
      U32._MAX = UintHelper.max(U32.SIZE) as U32;
    }
    return U32._MAX;
  }

  readonly size = U32.SIZE;

  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U32.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U32 {
    return super.plus(other, base) as U32;
  }

  minus(other: UintFrom, base?: number): U32{
    return super.minus(other, base) as U32;
  }
  
  mul(other: UintFrom, base?: number): U32{
    return super.mul(other, base) as U32;
  }
}

export class U64 extends Uint {
  static readonly SIZE = 8;
  static _MAX: U64 | undefined;
  static max(): U64 {
    if (!U64._MAX) {
      U64._MAX = UintHelper.max(U64.SIZE) as U64;
    }
    return U64._MAX;
  }
  
  readonly size = U64.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U64.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U64 {
    return super.plus(other, base) as U64;
  }

  minus(other: UintFrom, base?: number): U64 {
    return super.minus(other, base) as U64;
  }

  idiv(other: UintFrom, base?: number): U64 {
    return super.idiv(other, base) as U64;
  }

  mul(other: UintFrom, base?: number): U64 {
    return super.mul(other, base) as U64;
  }

  mod(other: UintFrom, base?: number): U64 {
    return super.mod(other, base) as U64;
  }

  sameDay(other: UintFrom): boolean {
    let a = this.toBigNumber();
    let b = new U64(other).toBigNumber();
    a = a.minus(a.mod(86400));
    b = b.minus(b.mod(86400));
    return a.eq(b);
  }

  isMax(): boolean {
    return this.eq(U64.max());
  }

  valid(): boolean {
    return !this.isMax();
  }
}

export class U128 extends Uint {
  static readonly SIZE = 16;
  static _RAI: U128 | undefined;
  static RAI(): U128 {
    if (!U128._RAI) {
      U128._RAI = new U128('1000000000');
    }
    return U128._RAI;
  }
  
  readonly size = U128.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U128.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U128 {
    return super.plus(other, base) as U128;
  }

  minus(other: UintFrom, base?: number): U128 {
    return super.minus(other, base) as U128;
  }

  mul(other: UintFrom, base?: number): U128 {
    return super.mul(other, base) as U128;
  }

  idiv(other: UintFrom, base?: number): U128 {
    return super.idiv(other, base) as U128;
  }

  toBalanceStr(scale: U128, decimals?: U8): string {
    if (typeof decimals !== 'undefined') {
      return this.toBigNumber().div(scale.toBigNumber()).toFixed(decimals.toNumber(), 1);
    }

    let result = this.toBalanceStr(scale, new U8(9));
    while (result.length > 1 && result[result.length - 1] === '0') {
      result = result.slice(0, result.length - 1);
    }

    if (result[result.length - 1] === '.') {
      result = result.slice(0, result.length - 1);
    }

    return result;
  }

}

export class U256 extends Uint {
  static readonly SIZE = 32;
  static _MAX: U256 | undefined;
  static max(): U256 {
    if (!U256._MAX) {
      U256._MAX = UintHelper.max(U256.SIZE) as U256;
    }
    return U256._MAX;
  }

  static gcd(a: U256, b: U256): U256 {
    if (b.eq(0)) return a;
    if (a.eq(0)) return b;
    return U256.gcd(b, a.mod(b));
  }

  readonly size = U256.SIZE;
  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U256.SIZE, check);
  }

  mul(other: UintFrom, base?: number): U256 {
    return super.mul(other, base) as U256;
  }

  idiv(other: UintFrom, base?: number): U256 {
    return super.idiv(other, base) as U256;
  }

  plus(other: UintFrom, base?: number): U256 {
    return super.plus(other, base) as U256;
  }

  minus(other: UintFrom, base?: number): U256 {
    return super.minus(other, base) as U256;
  }

  mod(other: UintFrom, base?: number): U256 {
    return super.mod(other, base) as U256;
  }

  toAccountAddress(): string {
    return generateAddress(this.bytes);
  }

  toEthAddress(): string {
    return toChecksumAddress(this.toHex().substr(24));
  }

  fromAccountAddress(str: string): boolean {
    if (str.length !== 64) return true;
    if(!str.startsWith('rai_1') && !str.startsWith('rai_3')) {
      return true;
    }

    let account_crop = str.substring(4,64);
    let isValid = /^[13456789abcdefghijkmnopqrstuwxyz]+$/.test(account_crop);
    if (!isValid) return true;

    let key_uint4 = array_crop(uint5ToUint4(stringToUint5(account_crop.substring(0, 52))));
    let hash_uint4 = uint5ToUint4(stringToUint5(account_crop.substring(52, 60)));
    let key_array = uint4ToUint8(key_uint4);
    let blake_hash = blake.blake2b(key_array, null, 5).reverse();

    if (!equal_arrays(hash_uint4, uint8ToUint4(blake_hash))) return true;

    this.bytes = key_array;
    return false;
  }

  fromEthAddress(str: string): boolean {
    if(!/^(0x)?[0-9a-f]{40}$/i.test(str)) return true;
    str = str.replace(/^0x/i,'');
    this.bytes = new U256(str, 16).bytes;
    return false;
  }

  fromShare(priKey: U256 | string | Uint8Array, pubKey: U256 | string | Uint8Array): boolean {
    let a: Uint8Array;
    let b: Uint8Array;
    if (typeof priKey === 'string') {
      priKey = new U256(priKey, 16);
      a = priKey.bytes;
    } else if (priKey instanceof U256) {
      a = priKey.bytes;
    } else {
      a = priKey;
    }

    if (typeof pubKey === 'string') {
      pubKey = new U256(pubKey, 16);
      b = pubKey.bytes;
    } else if (pubKey instanceof U256) {
      b = pubKey.bytes;
    } else {
      b = pubKey;
    }

    try {
      this.bytes = sharedKey(a, b, true);
      if (this.bytes.length !== 32 || this.eq(0)) return true;
      return false;
    } catch (e) {
      console.log(e);
      return true;
    }
  }

  toBalanceStr(decimals: U8, format: boolean = true): string {
    const BigNumberCustom = BigNumber.another({ DECIMAL_PLACES: 255 });
    const decimalsValue = new BigNumberCustom(10).pow(decimals.toNumber());
    let result = new BigNumberCustom(this.toBigNumber()).div(decimalsValue).toFormat(decimals.toNumber(), 1);

    if (decimals.toNumber() === 0)
    {
      return format ? result : result.replace(/,/g, '');
    }

    while (result.length > 1 && result[result.length - 1] === '0') {
      result = result.slice(0, result.length - 1);
    }

    if (result[result.length - 1] === '.') {
      result = result.slice(0, result.length - 1);
    }

    return format ? result : result.replace(/,/g, '');;
  }

  isNativeTokenAddress(): boolean {
    return this.eq(1);
  }

}

export class U512 extends Uint {
  static readonly SIZE = 64;
  readonly size = U512.SIZE;
  static _MAX: U512 | undefined;
  static max(): U512 {
    if (!U512._MAX) {
      U512._MAX = UintHelper.max(U512.SIZE) as U512;
    }
    return U512._MAX;
  }

  constructor(from: UintFrom = 0, base?: number, check: boolean = true) {
    super(from, base, U512.SIZE, check);
  }

  plus(other: UintFrom, base?: number): U512 {
    return super.plus(other, base) as U512;
  }

  minus(other: UintFrom, base?: number): U512 {
    return super.minus(other, base) as U512;
  }

  mul(other: UintFrom, base?: number): U512 {
    return super.mul(other, base) as U512;
  }

  idiv(other: UintFrom, base?: number): U512 {
    return super.idiv(other, base) as U512;
  }

  mod(other: UintFrom, base?: number): U512 {
    return super.mod(other, base) as U512;
  }

  encrypt(share: U256 | Uint8Array) {
    if (share instanceof U256) {
      share = share.bytes;
    }
    const key = CryptoJS.enc.Hex.parse(uint8ToHex(share.slice(0, 16)));
    const iv = CryptoJS.enc.Hex.parse(uint8ToHex(share.slice(16)));
    const cfg = {
      mode: CryptoJS.mode.CTR,
      iv: iv,
      padding: CryptoJS.pad.NoPadding,
      format: CryptoJS.format.Hex
    };
    const data = CryptoJS.enc.Hex.parse(this.toHex());
    const result = CryptoJS.AES.encrypt(data, key, cfg);
    this.bytes = new U512(result.ciphertext, 16).bytes;
  }

  decrypt(share: U256 | Uint8Array) {
    if (share instanceof U256) {
      share = share.bytes;
    }
    const key = CryptoJS.enc.Hex.parse(uint8ToHex(share.slice(0, 16)));
    const iv = CryptoJS.enc.Hex.parse(uint8ToHex(share.slice(16)));
    const cfg = {
      mode: CryptoJS.mode.CTR,
      iv: iv,
      padding: CryptoJS.pad.NoPadding,
      format: CryptoJS.format.Hex
    };
    const result = CryptoJS.AES.decrypt(this.toHex(), key, cfg);
    this.bytes = new U512(result.toString(), 16).bytes;
  }

}


export enum ExtensionType {
  INVALID     = 0,
  SUB_ACCOUNT = 1,
  NOTE        = 2,
  ALIAS       = 3,
  TOKEN       = 4,

  RESERVED_MAX = 1023,
}

export enum ExtensionTypeStr {
  INVALID     = 'invalid',
  SUB_ACCOUNT = 'sub_account',
  NOTE        = 'note',
  ALIAS       = 'alias',
  TOKEN       = 'token',
}

export enum ExtensionAliasOp {
  INVALID     = 0,
  NAME        = 1,
  DNS         = 2,
}

export enum ExtensionAliasOpStr {
  INVALID     = 'invalid',
  NAME        = 'name',
  DNS         = 'dns',
}

export enum ExtensionTokenOp {
  INVALID = 0,
  CREATE  = 1,
  MINT    = 2,
  BURN    = 3,
  SEND    = 4,
  RECEIVE = 5,
  SWAP    = 6,
  UNMAP   = 7,
  WRAP    = 8,
}

export enum ExtensionTokenOpStr {
  INVALID = 'invalid',
  CREATE  = 'create',
  MINT    = 'mint',
  BURN    = 'burn',
  SEND    = 'send',
  RECEIVE = 'receive',
  SWAP    = 'swap',
  UNMAP   = 'unmap',
  WRAP    = 'wrap',
}

type TokenOpMap = [ExtensionTokenOp, ExtensionTokenOpStr];
const tokenOpMaps: TokenOpMap[] = [
  [ExtensionTokenOp.INVALID, ExtensionTokenOpStr.INVALID],
  [ExtensionTokenOp.CREATE, ExtensionTokenOpStr.CREATE],
  [ExtensionTokenOp.MINT, ExtensionTokenOpStr.MINT],
  [ExtensionTokenOp.BURN, ExtensionTokenOpStr.BURN],
  [ExtensionTokenOp.SEND, ExtensionTokenOpStr.SEND],
  [ExtensionTokenOp.RECEIVE, ExtensionTokenOpStr.RECEIVE],
  [ExtensionTokenOp.SWAP, ExtensionTokenOpStr.SWAP],
  [ExtensionTokenOp.UNMAP, ExtensionTokenOpStr.UNMAP],
  [ExtensionTokenOp.WRAP, ExtensionTokenOpStr.WRAP],
]

export enum TokenSwapSubOp {
  INVALID     = 0,
  CONFIG      = 1,
  MAKE        = 2,
  INQUIRY     = 3,
  INQUIRY_ACK = 4,
  TAKE        = 5,
  TAKE_ACK    = 6,
  TAKE_NACK   = 7,
  CANCEL      = 8,
  PING        = 9,
  PONG        = 10,
}

export enum TokenSwapSubOpStr {
  INVALID     = "invalid",
  CONFIG      = "config",
  MAKE        = "make",
  INQUIRY     = "inquiry",
  INQUIRY_ACK = "inquiry_ack",
  TAKE        = "take",
  TAKE_ACK    = "take_ack",
  TAKE_NACK   = "take_nack",
  CANCEL      = "cancel",
  PING        = "ping",
  PONG        = "pong",
}

type TokenSwapSubOpMap = [TokenSwapSubOp, TokenSwapSubOpStr];
const tokenSwapSubOpMaps: TokenSwapSubOpMap[] = [
  [TokenSwapSubOp.INVALID, TokenSwapSubOpStr.INVALID],
  [TokenSwapSubOp.CONFIG, TokenSwapSubOpStr.CONFIG],
  [TokenSwapSubOp.MAKE, TokenSwapSubOpStr.MAKE],
  [TokenSwapSubOp.INQUIRY, TokenSwapSubOpStr.INQUIRY],
  [TokenSwapSubOp.INQUIRY_ACK, TokenSwapSubOpStr.INQUIRY_ACK],
  [TokenSwapSubOp.TAKE, TokenSwapSubOpStr.TAKE],
  [TokenSwapSubOp.TAKE_ACK, TokenSwapSubOpStr.TAKE_ACK],
  [TokenSwapSubOp.TAKE_NACK, TokenSwapSubOpStr.TAKE_NACK],
  [TokenSwapSubOp.CANCEL, TokenSwapSubOpStr.CANCEL],
  [TokenSwapSubOp.PING, TokenSwapSubOpStr.PING],
  [TokenSwapSubOp.PONG, TokenSwapSubOpStr.PONG],
]

export enum TokenType {
  INVALID = 0,
  _20     = 1,
  _721    = 2,
}

export enum TokenTypeStr {
  INVALID = 'invalid',
  _20     = '20',
  _721    = '721',
}

type TokenTypeMap = [TokenType, TokenTypeStr];
const tokenTypeMaps: TokenTypeMap[] = [
  [TokenType.INVALID, TokenTypeStr.INVALID],
  [TokenType._20, TokenTypeStr._20],
  [TokenType._721, TokenTypeStr._721],
]

export enum TokenSource {
  INVALID     = 0,
  SEND        = 1,
  MAP         = 2,
  UNWRAP      = 3,
  SWAP        = 4,
  MINT        = 5,
  REFUND      = 6,
}

export enum TokenSourceStr {
  INVALID     = 'invalid',
  SEND        = 'send',
  MAP         = 'map',
  UNWRAP      = 'unwrap',
  SWAP        = 'swap',
  MINT        = 'mint',
  REFUND      = 'refund',
}

type TokenSourceMap = [TokenSource, TokenSourceStr];
const tokenSourceMaps: TokenSourceMap[] = [
  [TokenSource.INVALID, TokenSourceStr.INVALID],
  [TokenSource.SEND, TokenSourceStr.SEND],
  [TokenSource.MAP, TokenSourceStr.MAP],
  [TokenSource.UNWRAP, TokenSourceStr.UNWRAP],
  [TokenSource.SWAP, TokenSourceStr.SWAP],
  [TokenSource.MINT, TokenSourceStr.MINT],
  [TokenSource.REFUND, TokenSourceStr.REFUND],
]

export class TokenHelper {
  static toType(str: string): TokenType {
    const map = tokenTypeMaps.find(x => str === x[1]);
    if (map) return map[0];
    return TokenType.INVALID;
  }

  static toTypeStr(type: TokenType): string {
    const map = tokenTypeMaps.find(x => type === x[0]);
    if (map) return map[1];
    return '';
  }

  static toSource(str: string): TokenSource {
    const map = tokenSourceMaps.find(x => str  === x[1]);
    if (map) return map[0];
    return TokenSource.INVALID;
  }

  static toSourceStr(source: TokenSource): string {
    const map = tokenSourceMaps.find(x => source === x[0]);
    if (map) return map[1];
    return '';
  }

  static toOp(str: string): ExtensionTokenOp {
    const map = tokenOpMaps.find(x => str  === x[1]);
    if (map) return map[0];
    return ExtensionTokenOp.INVALID;
  }

  static toOpStr(op: ExtensionTokenOp): string {
    const map = tokenOpMaps.find(x => op === x[0]);
    if (map) return map[1];
    return '';
  }

  static toSwapSubOp(str: string): TokenSwapSubOp {
    const map = tokenSwapSubOpMaps.find(x => str  === x[1]);
    if (map) return map[0];
    return TokenSwapSubOp.INVALID;
  }

  static toSwapSubOpStr(op: TokenSwapSubOp): string {
    const map = tokenSwapSubOpMaps.find(x => op === x[0]);
    if (map) return map[1];
    return '';
  }

  static isLocalSource(source: TokenSource): boolean {
    return source === TokenSource.MINT || source === TokenSource.SEND 
           || source === TokenSource.SWAP || source === TokenSource.REFUND;
  }

}

export enum Chain {
  INVALID                 = 0,
  RAICOIN                 = 1,
  BITCOIN                 = 2,
  ETHEREUM                = 3,
  BINANCE_SMART_CHAIN     = 4,

  RAICOIN_TEST                = 10010,
  BITCOIN_TEST                = 10020,
  ETHEREUM_TEST_ROPSTEN       = 10030,
  ETHEREUM_TEST_KOVAN         = 10031,
  ETHEREUM_TEST_RINKEBY       = 10032,
  ETHEREUM_TEST_GOERLI        = 10033,
  BINANCE_SMART_CHAIN_TEST    = 10040,
}

export enum ChainStr {
  INVALID                 = 'invalid',
  RAICOIN                 = 'raicoin',
  BITCOIN                 = 'bitcoin',
  ETHEREUM                = 'ethereum',
  BINANCE_SMART_CHAIN     = 'binance smart chain',

  RAICOIN_TEST                = 'raicoin testnet',
  BITCOIN_TEST                = 'bitcoin testnet',
  ETHEREUM_TEST_ROPSTEN       = 'ethereum ropsten testnet',
  ETHEREUM_TEST_KOVAN         = 'ethereum kovan testnet',
  ETHEREUM_TEST_RINKEBY       = 'ethereum rinkeby testnet',
  ETHEREUM_TEST_GOERLI        = 'ethereum goerli testnet',
  BINANCE_SMART_CHAIN_TEST    = 'binance smart chain testnet',
}

export enum ChainShown {
  INVALID                 = 'Invalid',
  RAICOIN                 = 'Raicoin',
  BITCOIN                 = 'Bitcoin',
  ETHEREUM                = 'Ethereum',
  BINANCE_SMART_CHAIN     = 'Binance Smart Chain',

  RAICOIN_TEST                = 'Raicoin Testnet',
  BITCOIN_TEST                = 'Bitcoin Testnet',
  ETHEREUM_TEST_ROPSTEN       = 'Ropsten',
  ETHEREUM_TEST_KOVAN         = 'Kovan',
  ETHEREUM_TEST_RINKEBY       = 'Rinkeby',
  ETHEREUM_TEST_GOERLI        = 'Goerli',
  BINANCE_SMART_CHAIN_TEST    = 'BSC Testnet',
}

type ChainMap = [Chain, ChainStr, ChainShown];
const chainMaps: ChainMap[] = [
  [Chain.INVALID, ChainStr.INVALID, ChainShown.INVALID],
  [Chain.RAICOIN, ChainStr.RAICOIN, ChainShown.RAICOIN],
  [Chain.BITCOIN, ChainStr.BITCOIN, ChainShown.RAICOIN_TEST],
  [Chain.ETHEREUM, ChainStr.ETHEREUM, ChainShown.ETHEREUM],
  [Chain.BINANCE_SMART_CHAIN, ChainStr.BINANCE_SMART_CHAIN, ChainShown.BINANCE_SMART_CHAIN],

  [Chain.RAICOIN_TEST, ChainStr.RAICOIN_TEST, ChainShown.RAICOIN_TEST],
  [Chain.BITCOIN_TEST, ChainStr.BITCOIN_TEST, ChainShown.BITCOIN_TEST],
  [Chain.ETHEREUM_TEST_ROPSTEN, ChainStr.ETHEREUM_TEST_ROPSTEN, ChainShown.ETHEREUM_TEST_ROPSTEN],
  [Chain.ETHEREUM_TEST_KOVAN, ChainStr.ETHEREUM_TEST_KOVAN, ChainShown.ETHEREUM_TEST_KOVAN],
  [Chain.ETHEREUM_TEST_RINKEBY, ChainStr.ETHEREUM_TEST_RINKEBY, ChainShown.ETHEREUM_TEST_RINKEBY],
  [Chain.ETHEREUM_TEST_GOERLI, ChainStr.ETHEREUM_TEST_GOERLI, ChainShown.ETHEREUM_TEST_GOERLI],
  [Chain.BINANCE_SMART_CHAIN_TEST, ChainStr.BINANCE_SMART_CHAIN_TEST, ChainShown.BINANCE_SMART_CHAIN_TEST]
]

const crossChains: {[current: string]: Chain[]} = {
  'raicoin': [
    Chain.RAICOIN
    // todo:
  ],

  'raicoin test': [
    Chain.RAICOIN_TEST
  ]
}

const crossChainStrs: {[current: string]: ChainStr[]} = {
  'raicoin': [
    ChainStr.RAICOIN
  ],

  'raicoin test': [
    ChainStr.RAICOIN_TEST
  ]
}

export class ChainHelper {
  static toChain(str: string): Chain {
    const map = chainMaps.find(x => str === x[1]);
    if (map) return map[0];
    return Chain.INVALID;
  }

  static toChainStr(chain: Chain): string {
    const map = chainMaps.find(x => chain === x[0]);
    if (map) return map[1];
    return '';
  }

  static toChainShown(chain: string): string {
    const map = chainMaps.find(x => chain === x[1]);
    if (map) return map[2];
    return '';
  }

  static addressToRaw(chain: string, address: string): {error: boolean, raw?: U256} {
    if (address === '') {
      return { error: false, raw: new U256(1) };
    }

    switch (chain) {
      case ChainStr.RAICOIN:
      case ChainStr.RAICOIN_TEST:
      {
        const raw = new U256();
        const error = raw.fromAccountAddress(address);
        return { error, raw };
      }
      case ChainStr.BINANCE_SMART_CHAIN:
      case ChainStr.BINANCE_SMART_CHAIN_TEST:
      case ChainStr.ETHEREUM:
      case ChainStr.ETHEREUM_TEST_GOERLI:
      case ChainStr.ETHEREUM_TEST_KOVAN:
      case ChainStr.ETHEREUM_TEST_RINKEBY:
      case ChainStr.ETHEREUM_TEST_ROPSTEN:
      {
        const raw = new U256();
        const error = raw.fromEthAddress(address);
        return { error, raw };
      }
      // todo:
      default:
        return { error: true };
    }
  }

  static rawToAddress(chain: string, raw: U256 | string): {error: boolean, address?: string} {
    if (typeof raw === 'string') {
      raw = new U256(raw, 16);
    }
    
    switch (chain) {
      case ChainStr.RAICOIN:
      case ChainStr.RAICOIN_TEST:
      {
        return { error: false, address: raw.toAccountAddress() };
      }
      case ChainStr.BINANCE_SMART_CHAIN:
      case ChainStr.BINANCE_SMART_CHAIN_TEST:
      case ChainStr.ETHEREUM:
      case ChainStr.ETHEREUM_TEST_GOERLI:
      case ChainStr.ETHEREUM_TEST_KOVAN:
      case ChainStr.ETHEREUM_TEST_RINKEBY:
      case ChainStr.ETHEREUM_TEST_ROPSTEN:
      {
        return { error: false, address: raw.toEthAddress() };
      }
      // todo:
      default:
        return { error: true };
    }
  }

  static toShortAddress(chain: string, address: string, reserve: number = 4): string {
    switch (chain) {
      case ChainStr.RAICOIN:
      case ChainStr.RAICOIN_TEST:
      {
        return shortAddress(address, reserve);
      }
      case ChainStr.ETHEREUM:
      case ChainStr.ETHEREUM_TEST_GOERLI:
      case ChainStr.ETHEREUM_TEST_KOVAN:
      case ChainStr.ETHEREUM_TEST_RINKEBY:
      case ChainStr.ETHEREUM_TEST_ROPSTEN:
      case ChainStr.BINANCE_SMART_CHAIN:
      case ChainStr.BINANCE_SMART_CHAIN_TEST:
      {
        return shortEthAddress(address, reserve);
      }
      // todo:
      default:
        return address;
    }
  }

  static crossChains(currentChain: string): Chain[] {
    if (!crossChains[currentChain]) return [];
    return crossChains[currentChain];
  }

  static crossChainStrs(currentChain: string): ChainStr[] {
    if (!crossChainStrs[currentChain]) return [];
    return crossChainStrs[currentChain];
  }

  static tokenTypeShown(chain: string, type: TokenTypeStr): string {
    switch (chain) {
      case ChainStr.RAICOIN:
      case ChainStr.RAICOIN_TEST:
      {
        return `RAI-${type}`;
      }
      case ChainStr.ETHEREUM:
      case ChainStr.ETHEREUM_TEST_ROPSTEN:
      case ChainStr.ETHEREUM_TEST_ROPSTEN:
      case ChainStr.ETHEREUM_TEST_KOVAN:
      case ChainStr.ETHEREUM_TEST_RINKEBY:
      case ChainStr.ETHEREUM_TEST_GOERLI:
      {
        return `ERC-${type}`;
      }
      case ChainStr.BINANCE_SMART_CHAIN:
      case ChainStr.BINANCE_SMART_CHAIN_TEST:
      {
        return `BEP-${type}`;
      }
      // todo:
      default:
        return '';
    }
  }

  static isNative(chain: string, address: string | U256): boolean {
    if (typeof address === 'string') {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error || !ret.raw) return false;
      address = ret.raw;
    }
    return address.isNativeTokenAddress();
  }

  static isRaicoin(chain: string | Chain): boolean {
    if (typeof chain === 'string') {
      return chain === ChainStr.RAICOIN || chain === ChainStr.RAICOIN_TEST;
    } else {
      return chain === Chain.RAICOIN || chain === Chain.RAICOIN_TEST;
    }
  }

}

interface ExtensionTokenSwapCodec {
  encode(value: any): Uint8Array;
  decode(array: Uint8Array, value: {[key: string]: string}): void;
}

const tokenSwapExtensionCodecs: {[op: string]: ExtensionTokenSwapCodec} = {
  config: {
    encode : (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.CONFIG], count);
      count += 1;

      if (!value.main_account || typeof value.main_account !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.config.encode: invalid main_account=${value.main_account}`);
      }
      const mainAccount = new U256();
      const error = mainAccount.fromAccountAddress(value.main_account);
      if (error) {
        throw new Error(`ExtensionHelper.token.swap.config.encode: invalid main_account=${value.main_account}`);
      }
      buffer.set(mainAccount.bytes, count);
      count += mainAccount.size;

      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.config.decode: invalid stream`);
      let offset = 0;

      const mainAccount = new U256();
      let error = mainAccount.fromArray(array, offset);
      if (error) throw streamError;
      offset += mainAccount.size;
      value.main_account = mainAccount.toAccountAddress();
      if (offset !== array.length) throw streamError;
    }
  },

  make: {
    encode : (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.MAKE], count);
      count += 1;

      if (!value.token_offer || typeof value.token_offer !== 'object') {
        throw new Error(`ExtensionHelper.token.swap.make.encode: invalid token_offer=${value.token_offer}`);
      }
      const offer = value.token_offer;

      let chain = ChainHelper.toChain(offer.chain);
      if (chain === Chain.INVALID) {
        throw new Error(`ExtensionHelper.token.swap.make.encode: invalid token_offer.chain=${offer.chain}`);
      }
      buffer.set((new U32(chain)).bytes, count);
      count += 4;

      let type = TokenHelper.toType(offer.type);
      if (type === TokenType.INVALID) {
        throw new Error(`ExtensionHelper.token.swap.make.encode: invalid token_offer.type=${offer.type}`);
      }
      buffer.set([type], count);
      count += 1;

      let address = new U256(offer.address_raw, 16);
      buffer.set(address.bytes, count);
      count += address.size;

      if (!value.token_want || typeof value.token_want !== 'object') {
        throw new Error(`ExtensionHelper.token.swap.make.encode: invalid token_want=${value.token_want}`);
      }
      const want = value.token_want;

      chain = ChainHelper.toChain(want.chain);
      if (chain === Chain.INVALID) {
        throw new Error(`ExtensionHelper.token.swap.make.encode: invalid token_want.chain=${want.chain}`);
      }
      buffer.set((new U32(chain)).bytes, count);
      count += 4;

      type = TokenHelper.toType(want.type);
      if (type === TokenType.INVALID) {
        throw new Error(`ExtensionHelper.token.swap.make.encode: invalid token_want.type=${want.type}`);
      }
      buffer.set([type], count);
      count += 1;

      address = new U256(want.address_raw, 16);
      buffer.set(address.bytes, count);
      count += address.size;

      if (!value.value_offer || typeof value.value_offer !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.make.encode: invalid value_offer=${value.value_offer}`);
      }
      const valueOffer = new U256(value.value_offer);
      buffer.set(valueOffer.bytes, count);
      count += valueOffer.size;

      if (!value.value_want || typeof value.value_want !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.make.encode: invalid value_want=${value.value_want}`);
      }
      const valueWant = new U256(value.value_want);
      buffer.set(valueWant.bytes, count);
      count += valueWant.size;

      if (offer.type === TokenTypeStr._20 && want.type === TokenTypeStr._20) {
        if (!value.min_offer || typeof value.min_offer !== 'string') {
          throw new Error(`ExtensionHelper.token.swap.make.encode: invalid min_offer=${value.min_offer}`);
        }
        const minOffer = new U256(value.min_offer);
        buffer.set(minOffer.bytes, count);
        count += minOffer.size;
  
        if (!value.max_offer || typeof value.max_offer !== 'string') {
          throw new Error(`ExtensionHelper.token.swap.make.encode: invalid max_offer=${value.max_offer}`);
        }
        const maxOffer = new U256(value.max_offer);
        buffer.set(maxOffer.bytes, count);
        count += maxOffer.size;
      }

      const timeout = new U64(value.timeout);
      buffer.set(timeout.bytes, count);
      count += timeout.size;

      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.make.decode: invalid stream`);
      const length = array.length;
      let offset = 0;

      // token_offer
      let chain = new U32();
      let error = chain.fromArray(array, offset);
      if (error) throw streamError;
      offset += chain.size;
      const offer: any = {};
      offer.chain = ChainHelper.toChainStr(chain.toNumber());
      if (!offer.chain) {
        throw new Error(`ExtensionHelper.token.swap.make.decode: invalid chain=${chain.toNumber()}`);
      }
      if (offset + 1 > length) {
        throw streamError;
      }
      let type = array[offset];
      offset += 1;
      offer.type = TokenHelper.toTypeStr(type);
      if (!offer.type) {
        throw new Error(`ExtensionHelper.token.swap.make.decode: invalid type=${type}`);
      }
      let address = new U256();
      error = address.fromArray(array, offset);
      if (error) throw streamError;
      offset += address.size;
      offer.address_raw = address.toHex();
      let ret = ChainHelper.rawToAddress(offer.chain, address);
      if (ret.error || !ret.address) {
        throw new Error(`ExtensionHelper.token.swap.make.decode: invalid address=${offer.address_raw}`);
      }
      offer.address = ret.address;
      value.token_offer = offer;

      // token_want
      chain = new U32();
      error = chain.fromArray(array, offset);
      if (error) throw streamError;
      offset += chain.size;
      const want: any = {};
      want.chain = ChainHelper.toChainStr(chain.toNumber());
      if (!want.chain) {
        throw new Error(`ExtensionHelper.token.swap.make.decode: invalid chain=${chain.toNumber()}`);
      }
      if (offset + 1 > length) {
        throw streamError;
      }
      type = array[offset];
      offset += 1;
      want.type = TokenHelper.toTypeStr(type);
      if (!want.type) {
        throw new Error(`ExtensionHelper.token.swap.make.decode: invalid type=${type}`);
      }
      address = new U256();
      error = address.fromArray(array, offset);
      if (error) throw streamError;
      offset += address.size;
      want.address_raw = address.toHex();
      ret = ChainHelper.rawToAddress(want.chain, address);
      if (ret.error || !ret.address) {
        throw new Error(`ExtensionHelper.token.swap.make.decode: invalid address=${want.address_raw}`);
      }
      want.address = ret.address;
      value.token_want = want;

      const valueOffer = new U256();
      error = valueOffer.fromArray(array, offset);
      if (error) throw streamError;
      offset += valueOffer.size;
      value.value_offer = valueOffer.toDec();

      const valueWant = new U256();
      error = valueWant.fromArray(array, offset);
      if (error) throw streamError;
      offset += valueWant.size;
      value.value_want = valueWant.toDec();

      if (offer.type === TokenTypeStr._20 && want.type === TokenTypeStr._20) {
        const minOffer = new U256();
        error = minOffer.fromArray(array, offset);
        if (error) throw streamError;
        offset += minOffer.size;
        value.min_offer = minOffer.toDec();

        const maxOffer = new U256();
        error = maxOffer.fromArray(array, offset);
        if (error) throw streamError;
        offset += maxOffer.size;
        value.max_offer = maxOffer.toDec();
      }

      const timeout = new U64();
      error = timeout.fromArray(array, offset);
      if (error) throw streamError;
      offset += timeout.size;
      value.timeout = timeout.toDec();

      if (offset !== array.length) throw streamError;
    }
  },

  inquiry: {
    encode : (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.INQUIRY], count);
      count += 1;

      if (!value.maker || typeof value.maker !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.inquiry.encode: invalid maker=${value.maker}`);
      }
      const maker = new U256();
      const error = maker.fromAccountAddress(value.maker);
      if (error) {
        throw new Error(`ExtensionHelper.token.swap.inquiry.encode: invalid maker=${value.maker}`);
      }
      buffer.set(maker.bytes, count);
      count += maker.size;

      const orderHeight = new U64(value.order_height);
      buffer.set(orderHeight.bytes, count);
      count += orderHeight.size;

      const ackHeight = new U64(value.ack_height);
      buffer.set(ackHeight.bytes, count);
      count += ackHeight.size;

      const timeout = new U64(value.timeout);
      buffer.set(timeout.bytes, count);
      count += timeout.size;

      if (!value.value || typeof value.value !== 'string') {
        throw new Error(`ExtensionHelper.token.make.inquiry.encode: invalid value=${value.value}`);
      }
      const tokenValue = new U256(value.value);
      buffer.set(tokenValue.bytes, count);
      count += tokenValue.size;

      if (!value.share || typeof value.share !== 'string') {
        throw new Error(`ExtensionHelper.token.make.inquiry.encode: invalid value=${value.share}`);
      }
      const share = new U256(value.share, 16);
      buffer.set(share.bytes, count);
      count += share.size;

      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.inquiry.decode: invalid stream`);
      let offset = 0;

      const maker = new U256();
      let error = maker.fromArray(array, offset);
      if (error) throw streamError;
      offset += maker.size;
      value.maker = maker.toAccountAddress();

      const orderHeight = new U64();
      error = orderHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += orderHeight.size;
      value.order_height = orderHeight.toDec();

      const ackHeight = new U64();
      error = ackHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += ackHeight.size;
      value.ack_height = ackHeight.toDec();

      const timeout = new U64();
      error = timeout.fromArray(array, offset);
      if (error) throw streamError;
      offset += timeout.size;
      value.timeout = timeout.toDec();

      const tokenValue = new U256();
      error = tokenValue.fromArray(array, offset);
      if (error) throw streamError;
      offset += tokenValue.size;
      value.value = tokenValue.toDec();

      const share = new U256();
      error = share.fromArray(array, offset);
      if (error) throw streamError;
      offset += share.size;
      value.share = share.toHex();

      if (offset !== array.length) throw streamError;
    }
  },

  inquiry_ack: {
    encode : (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.INQUIRY_ACK], count);
      count += 1;

      if (!value.taker || typeof value.taker !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.inquiry_ack.encode: invalid taker=${value.taker}`);
      }
      const taker = new U256();
      const error = taker.fromAccountAddress(value.taker);
      if (error) {
        throw new Error(`ExtensionHelper.token.swap.inquiry_ack.encode: invalid taker=${value.taker}`);
      }
      buffer.set(taker.bytes, count);
      count += taker.size;

      const inquiryHeight = new U64(value.inquiry_height);
      buffer.set(inquiryHeight.bytes, count);
      count += inquiryHeight.size;

      const tradeHeight = new U64(value.trade_height);
      buffer.set(tradeHeight.bytes, count);
      count += tradeHeight.size;

      if (!value.share || typeof value.share !== 'string') {
        throw new Error(`ExtensionHelper.token.make.inquiry_ack.encode: invalid value=${value.share}`);
      }
      const share = new U256(value.share, 16);
      buffer.set(share.bytes, count);
      count += share.size;

      if (!value.signature || typeof value.signature !== 'string') {
        throw new Error(`ExtensionHelper.token.make.inquiry_ack.encode: invalid signature=${value.signature}`);
      }
      const signature = new U512(value.signature, 16);
      buffer.set(signature.bytes, count);
      count += signature.size;

      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.inquiry.decode: invalid stream`);
      let offset = 0;

      const taker = new U256();
      let error = taker.fromArray(array, offset);
      if (error) throw streamError;
      offset += taker.size;
      value.taker = taker.toAccountAddress();

      const inquiryHeight = new U64();
      error = inquiryHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += inquiryHeight.size;
      value.inquiry_height = inquiryHeight.toDec();

      const tradeHeight = new U64();
      error = tradeHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += tradeHeight.size;
      value.trade_height = tradeHeight.toDec();

      const share = new U256();
      error = share.fromArray(array, offset);
      if (error) throw streamError;
      offset += share.size;
      value.share = share.toHex();

      const signature = new U512();
      error = signature.fromArray(array, offset);
      if (error) throw streamError;
      offset += signature.size;
      value.signature = signature.toHex();

      if (offset !== array.length) throw streamError;
    }
  },

  take: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.TAKE], count);
      count += 1;

      const inquiryHeight = new U64(value.inquiry_height);
      buffer.set(inquiryHeight.bytes, count);
      count += inquiryHeight.size;

      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.take.decode: invalid stream`);
      let offset = 0;

      const inquiryHeight = new U64();
      let error = inquiryHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += inquiryHeight.size;
      value.inquiry_height = inquiryHeight.toDec();

      if (offset !== array.length) throw streamError;
    }
  },

  take_ack: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.TAKE_ACK], count);
      count += 1;

      if (!value.taker || typeof value.taker !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.take_ack.encode: invalid taker=${value.taker}`);
      }
      const taker = new U256();
      let error = taker.fromAccountAddress(value.taker);
      if (error) {
        throw new Error(`ExtensionHelper.token.swap.take_ack.encode: invalid taker=${value.taker}`);
      }
      buffer.set(taker.bytes, count);
      count += taker.size;

      const inquiryHeight = new U64(value.inquiry_height);
      buffer.set(inquiryHeight.bytes, count);
      count += inquiryHeight.size;

      const takeHeight = new U64(value.take_height);
      buffer.set(takeHeight.bytes, count);
      count += takeHeight.size;

      if (!value.value || typeof value.value !== 'string') {
        throw new Error(`ExtensionHelper.token.make.take_ack.encode: invalid value=${value.value}`);
      }
      const tokenValue = new U256(value.value);
      buffer.set(tokenValue.bytes, count);
      count += tokenValue.size;

      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.take_ack.decode: invalid stream`);
      let offset = 0;

      const taker = new U256();
      let error = taker.fromArray(array, offset);
      if (error) throw streamError;
      offset += taker.size;
      value.taker = taker.toAccountAddress();

      const inquiryHeight = new U64();
      error = inquiryHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += inquiryHeight.size;
      value.inquiry_height = inquiryHeight.toDec();

      const takeHeight = new U64();
      error = takeHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += takeHeight.size;
      value.inquiry_height = takeHeight.toDec();

      const tokenValue = new U256();
      error = tokenValue.fromArray(array, offset);
      if (error) throw streamError;
      offset += tokenValue.size;
      value.value = tokenValue.toDec();

      if (offset !== array.length) throw streamError;
    }
  },

  take_nack: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.TAKE_NACK], count);
      count += 1;

      if (!value.taker || typeof value.taker !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.take_nack.encode: invalid taker=${value.taker}`);
      }
      const taker = new U256();
      let error = taker.fromAccountAddress(value.taker);
      if (error) {
        throw new Error(`ExtensionHelper.token.swap.take_nack.encode: invalid taker=${value.taker}`);
      }
      buffer.set(taker.bytes, count);
      count += taker.size;

      const inquiryHeight = new U64(value.inquiry_height);
      buffer.set(inquiryHeight.bytes, count);
      count += inquiryHeight.size;

      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.take_nack.decode: invalid stream`);
      let offset = 0;

      const taker = new U256();
      let error = taker.fromArray(array, offset);
      if (error) throw streamError;
      offset += taker.size;
      value.taker = taker.toAccountAddress();

      const inquiryHeight = new U64();
      error = inquiryHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += inquiryHeight.size;
      value.inquiry_height = inquiryHeight.toDec();

      if (offset !== array.length) throw streamError;
    }
  },

  cancel: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.CANCEL], count);
      count += 1;

      const orderHeight = new U64(value.order_height);
      buffer.set(orderHeight.bytes, count);
      count += orderHeight.size;

      return buffer.slice(0, count);
    },

    decode:  (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.cancel.decode: invalid stream`);
      let offset = 0;

      const orderHeight = new U64();
      let error = orderHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += orderHeight.size;
      value.order_height = orderHeight.toDec();

      if (offset !== array.length) throw streamError;
    }
  },

  ping: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.PING], count);
      count += 1;

      if (!value.maker || typeof value.maker !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.ping.encode: invalid maker=${value.maker}`);
      }
      const maker = new U256();
      let error = maker.fromAccountAddress(value.maker);
      if (error) {
        throw new Error(`ExtensionHelper.token.swap.ping.encode: invalid maker=${value.maker}`);
      }
      buffer.set(maker.bytes, count);
      count += maker.size;

      return buffer.slice(0, count);
    },

    decode:  (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.ping.decode: invalid stream`);
      let offset = 0;

      const maker = new U256();
      let error = maker.fromArray(array, offset);
      if (error) throw streamError;
      offset += maker.size;
      value.maker = maker.toAccountAddress();

      if (offset !== array.length) throw streamError;
    }
  },

  pong: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SWAP], count);
      count += 1;

      buffer.set([TokenSwapSubOp.PONG], count);
      count += 1;

      return buffer.slice(0, count);
    },

    decode:  (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.swap.pong.decode: invalid stream`);
      if (0 !== array.length) throw streamError;
    }
  }
}


interface ExtensionTokenCodec {
  encode(value: any): Uint8Array;
  decode(array: Uint8Array, value: {[key: string]: string}): void;
}

const tokenExtensionCodecs: {[op: string]: ExtensionTokenCodec} = {
  create: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.CREATE], count);
      count += 1;

      const type = TokenHelper.toType(value.type);
      buffer.set([type], count);
      count += 1;

      if (!value.name || typeof value.name !== 'string') {
        throw new Error(`ExtensionHelper.token.create.encode: invalid name=${value.name}`);
      }
      const name = new TextEncoder().encode(value.name);
      if (name.length > 255) {
        throw new Error(`ExtensionHelper.token.create.encode: invalid name=${value.name}`);
      }
      buffer.set([name.length], count);
      count += 1;
      buffer.set(name, count);
      count += name.length;

      if (!value.symbol || typeof value.symbol !== 'string') {
        throw new Error(`ExtensionHelper.token.create.encode: invalid symbol=${value.symbol}`);
      }
      const symbol = new TextEncoder().encode(value.symbol);
      if (symbol.length > 255) {
        throw new Error(`ExtensionHelper.token.create.encode: invalid symbol=${value.symbol}`);
      }
      buffer.set([symbol.length], count);
      count += 1;
      buffer.set(symbol, count);
      count += symbol.length;

      if (value.type === '20') {
        if (!value.init_supply || typeof value.init_supply !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid init_supply=${value.init_supply}`);
        }
        const initSupply = new U256(value.init_supply);
        buffer.set(initSupply.bytes, count);
        count += initSupply.bytes.length;

        if (!value.cap_supply || typeof value.cap_supply !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid cap_supply=${value.cap_supply}`);
        }
        const capSupply = new U256(value.cap_supply);
        buffer.set(capSupply.bytes, count);
        count += capSupply.bytes.length;

        if (!value.decimals || typeof value.decimals !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid decimals=${value.decimals}`);
        }
        const decimals = new U8(value.decimals);
        buffer.set(decimals.bytes, count);
        count += decimals.bytes.length;

        if (!value.burnable || typeof value.burnable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid burnable=${value.burnable}`);
        }
        const burnable = boolStrToUint8(value.burnable);
        if (burnable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid burnable=${value.burnable}`);
        }
        buffer.set(burnable, count);
        count += 1;

        if (!value.mintable || typeof value.mintable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid mintable=${value.mintable}`);
        }
        const mintable = boolStrToUint8(value.mintable);
        if (mintable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid mintable=${value.mintable}`);
        }
        buffer.set(mintable, count);
        count += 1;

        if (!value.circulable || typeof value.circulable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid circulable=${value.circulable}`);
        }
        const circulable = boolStrToUint8(value.circulable);
        if (circulable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid circulable=${value.circulable}`);
        }
        buffer.set(circulable, count);
        count += 1;

      } else if (value.type === '721') {
        if (typeof value.base_uri !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid base_uri=${value.base_uri}`);
        }
        const baseUri = new TextEncoder().encode(value.base_uri);
        if (baseUri.length > 255) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid base_uri=${value.base_uri}`);
        }
        buffer.set([baseUri.length], count);
        count += 1;
        buffer.set(baseUri, count);
        count += baseUri.length;
  
        if (!value.cap_supply || typeof value.cap_supply !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid cap_supply=${value.cap_supply}`);
        }
        const capSupply = new U256(value.cap_supply);
        buffer.set(capSupply.bytes, count);
        count += capSupply.bytes.length;

        if (!value.burnable || typeof value.burnable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid burnable=${value.burnable}`);
        }
        const burnable = boolStrToUint8(value.burnable);
        if (burnable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid burnable=${value.burnable}`);
        }
        buffer.set(burnable, count);
        count += 1;

        if (!value.circulable || typeof value.circulable !== 'string') {
          throw new Error(`ExtensionHelper.token.create.encode: invalid circulable=${value.circulable}`);
        }
        const circulable = boolStrToUint8(value.circulable);
        if (circulable.length !== 1) {
          throw new Error(`ExtensionHelper.token.create.encode: invalid circulable=${value.circulable}`);
        }
        buffer.set(circulable, count);
        count += 1;

      } else {
        throw new Error(`ExtensionHelper.token.create.encode: unknown op=${value.type}`);
      }

      return buffer.slice(0, count);
    },
    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.create.decode: invalid stream`);
      let offset = 0;
      let end = 0;
      const length = array.length;

      if (offset + 1 > length) {
        throw streamError;
      }
      const type = array[offset];
      offset += 1;
      value.type = TokenHelper.toTypeStr(type);

      if (offset + 1 > length) {
        throw streamError;
      }
      const nameSize = array[offset];
      offset += 1;
      end = offset + nameSize
      if (end > length) {
        throw streamError;
      }
      const utf8Decoder = new TextDecoder('utf-8', {fatal: true});
      value.name = utf8Decoder.decode(array.slice(offset, end));
      offset += nameSize;

      if (offset + 1 > length) {
        throw streamError;
      }
      const symbolSize = array[offset];
      offset += 1;
      end = offset + symbolSize;
      if (end > length) {
        throw streamError;
      }
      value.symbol = utf8Decoder.decode(array.slice(offset, end));
      offset += symbolSize;

      if (type === TokenType._20) {
        const initSupply = new U256();
        let error = initSupply.fromArray(array, offset);
        if (error) throw streamError;
        value.init_supply = initSupply.toDec();
        offset += initSupply.bytes.length;

        const capSupply = new U256();
        error = capSupply.fromArray(array, offset);
        if (error) throw streamError;
        value.cap_supply = capSupply.toDec();
        offset += capSupply.bytes.length;

        const decimals = new U8();
        error = decimals.fromArray(array, offset);
        if (error) throw streamError;
        value.decimals = decimals.toDec();
        offset += decimals.bytes.length;

        const burnable = uint8ToBoolStr(array, offset);
        if (!burnable) throw streamError;
        value.burnable = burnable;
        offset += 1;

        const mintable = uint8ToBoolStr(array, offset);
        if (!mintable) throw streamError;
        value.mintable = mintable;
        offset += 1;

        const circulable = uint8ToBoolStr(array, offset);
        if (!circulable) throw streamError;
        value.circulable = circulable;
        offset += 1;

      } else if (type === TokenType._721) {
        if (offset + 1 > length) {
          throw streamError;
        }
        const baseUriSize = array[offset];
        offset += 1;
        end = offset + baseUriSize
        if (end > length) {
          throw streamError;
        }
        value.base_uri = utf8Decoder.decode(array.slice(offset, end));
        offset += baseUriSize;

        const capSupply = new U256();
        let error = capSupply.fromArray(array, offset);
        if (error) throw streamError;
        value.cap_supply = capSupply.toDec();
        offset += capSupply.bytes.length;

        const burnable = uint8ToBoolStr(array, offset);
        if (!burnable) throw streamError;
        value.burnable = burnable;
        offset += 1;

        const circulable = uint8ToBoolStr(array, offset);
        if (!circulable) throw streamError;
        value.circulable = circulable;
        offset += 1;

      } else {
        throw streamError;
      }

      if (offset !== array.length) throw streamError;
    }
  },

  mint: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.MINT], count);
      count += 1;

      const type = TokenHelper.toType(value.type);
      if (type === TokenType.INVALID) {
        throw new Error(`ExtensionHelper.token.mint.encode: invalid type=${value.type}`);
      }
      buffer.set([type], count);
      count += 1;

      if (!value.to || typeof value.to !== 'string') {
        throw new Error(`ExtensionHelper.token.mint.encode: invalid to=${value.to}`);
      }
      const to = new U256();
      let error = to.fromAccountAddress(value.to);
      if (error) {
        throw new Error(`ExtensionHelper.token.mint.encode: invalid to=${value.to}`);
      }
      buffer.set(to.bytes, count);
      count += to.size;

      if (!value.value || typeof value.value !== 'string') {
        throw new Error(`ExtensionHelper.token.mint.encode: invalid value=${value.value}`);
      }
      const tokenValue = new U256(value.value);
      buffer.set(tokenValue.bytes, count);
      count += tokenValue.size;

      if (type === TokenType._721) {
        if (typeof value.uri !== 'string') {
          throw new Error(`ExtensionHelper.token.mint.encode: invalid uri=${value.uri}`);
        }
        const uri = new TextEncoder().encode(value.uri);
        if (uri.length > 255) {
          throw new Error(`ExtensionHelper.token.mint.encode: invalid uri=${value.uri}`);
        }
        buffer.set([uri.length], count);
        count += 1;
        buffer.set(uri, count);
        count += uri.length;
      }
      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.mint.decode: invalid stream`);
      let offset = 0;
      let end = 0;
      const length = array.length;

      if (offset + 1 > length) {
        throw streamError;
      }
      const type = array[offset];
      offset += 1;
      value.type = TokenHelper.toTypeStr(type);

      const to = new U256();
      let error = to.fromArray(array, offset);
      if (error) throw streamError;
      offset += to.size;
      value.to = to.toAccountAddress();

      const tokenValue = new U256();
      error = tokenValue.fromArray(array, offset);
      if (error) throw streamError;
      offset += tokenValue.size;
      value.value = tokenValue.toDec();

      if (type === TokenType._721) {
        if (offset + 1 > length) {
          throw streamError;
        }
        const uriSize = array[offset];
        offset += 1;
        end = offset + uriSize
        if (end > length) {
          throw streamError;
        }
        const utf8Decoder = new TextDecoder('utf-8', {fatal: true});
        value.uri = utf8Decoder.decode(array.slice(offset, end));
        offset += uriSize;
      }
      if (offset !== array.length) throw streamError;
    }
  },

  burn: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.BURN], count);
      count += 1;

      const type = TokenHelper.toType(value.type);
      if (type === TokenType.INVALID) {
        throw new Error(`ExtensionHelper.token.burn.encode: invalid type=${value.type}`);
      }
      buffer.set([type], count);
      count += 1;

      if (!value.value || typeof value.value !== 'string') {
        throw new Error(`ExtensionHelper.token.burn.encode: invalid value=${value.value}`);
      }
      const tokenValue = new U256(value.value);
      buffer.set(tokenValue.bytes, count);
      count += tokenValue.size;
      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.burn.decode: invalid stream`);
      let offset = 0;
      const length = array.length;

      if (offset + 1 > length) {
        throw streamError;
      }
      const type = array[offset];
      offset += 1;
      value.type = TokenHelper.toTypeStr(type);

      const tokenValue = new U256();
      let error = tokenValue.fromArray(array, offset);
      if (error) throw streamError;
      offset += tokenValue.size;
      value.value = tokenValue.toDec();
      if (offset !== array.length) throw streamError;
    }
  },

  send: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.SEND], count);
      count += 1;

      const chain = ChainHelper.toChain(value.chain);
      if (chain === Chain.INVALID) {
        throw new Error(`ExtensionHelper.token.send.encode: invalid chain=${value.chain}`);
      }
      buffer.set((new U32(chain)).bytes, count);
      count += 4;

      const type = TokenHelper.toType(value.type);
      if (type === TokenType.INVALID) {
        throw new Error(`ExtensionHelper.token.send.encode: invalid type=${value.type}`);
      }
      buffer.set([type], count);
      count += 1;

      const address = new U256(value.address_raw, 16);
      buffer.set(address.bytes, count);
      count += address.size;
      if (!value.to || typeof value.to !== 'string') {
        throw new Error(`ExtensionHelper.token.send.encode: invalid to=${value.to}`);
      }
      const to = new U256();
      let error = to.fromAccountAddress(value.to);
      if (error) {
        throw new Error(`ExtensionHelper.token.send.encode: invalid to=${value.to}`);
      }
      buffer.set(to.bytes, count);
      count += to.size;

      if (!value.value || typeof value.value !== 'string') {
        throw new Error(`ExtensionHelper.token.send.encode: invalid value=${value.value}`);
      }
      const tokenValue = new U256(value.value);
      buffer.set(tokenValue.bytes, count);
      count += tokenValue.size;

      return buffer.slice(0, count);
    },
    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.send.decode: invalid stream`);
      let offset = 0;
      const length = array.length;

      const chain = new U32();
      let error = chain.fromArray(array, offset);
      if (error) throw streamError;
      offset += chain.size;
      value.chain = ChainHelper.toChainStr(chain.toNumber());
      if (!value.chain) {
        throw new Error(`ExtensionHelper.token.send.decode: invalid chain=${chain.toNumber()}`);
      }

      if (offset + 1 > length) {
        throw streamError;
      }
      const type = array[offset];
      offset += 1;
      value.type = TokenHelper.toTypeStr(type);
      if (!value.type) {
        throw new Error(`ExtensionHelper.token.send.decode: invalid type=${type}`);
      }

      const address = new U256();
      error = address.fromArray(array, offset);
      if (error) throw streamError;
      offset += address.size;
      value.address_raw = address.toHex();
      let ret = ChainHelper.rawToAddress(value.chain, address);
      if (ret.error || !ret.address) {
        throw new Error(`ExtensionHelper.token.send.decode: invalid address=${value.address_raw}`);
      }
      value.address = ret.address;

      const to = new U256();
      error = to.fromArray(array, offset);
      if (error) throw streamError;
      offset += to.size;
      value.to = to.toAccountAddress();

      const tokenValue = new U256();
      error = tokenValue.fromArray(array, offset);
      if (error) throw streamError;
      offset += tokenValue.size;
      value.value = tokenValue.toDec();

      if (offset !== array.length) throw streamError;
    }
  },

  receive: {
    encode: (value: any) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      buffer.set([ExtensionTokenOp.RECEIVE], count);
      count += 1;

      const chain = ChainHelper.toChain(value.chain);
      if (chain === Chain.INVALID) {
        throw new Error(`ExtensionHelper.token.receive.encode: invalid chain=${value.chain}`);
      }
      buffer.set((new U32(chain)).bytes, count);
      count += 4;

      const type = TokenHelper.toType(value.type);
      if (type === TokenType.INVALID) {
        throw new Error(`ExtensionHelper.token.receive.encode: invalid type=${value.type}`);
      }
      buffer.set([type], count);
      count += 1;

      const address = new U256(value.address_raw, 16);
      buffer.set(address.bytes, count);
      count += address.size;

      const source = TokenHelper.toSource(value.source);
      if (source === TokenSource.INVALID) {
        throw new Error(`ExtensionHelper.token.receive.encode: invalid source=${value.source}`);
      }
      buffer.set([source], count);
      count += 1;

      const from = new U256(value.from_raw, 16);
      buffer.set(from.bytes, count);
      count += from.size;

      const blockHeight = new U64(value.block_height);
      buffer.set(blockHeight.bytes, count);
      count += blockHeight.size;

      const txHash = new U256(value.tx_hash, 16);
      buffer.set(txHash.bytes, count);
      count += txHash.size;

      const tokenValue = new U256(value.value);
      buffer.set(tokenValue.bytes, count);
      count += tokenValue.size;

      if (source === TokenSource.UNWRAP) {
        const unwrapChain = ChainHelper.toChain(value.unwrap_chain);
        if (unwrapChain === Chain.INVALID) {
          throw new Error(`ExtensionHelper.token.receive.encode: invalid unwrap_chain=${value.unwrap_chain}`);
        }
        buffer.set((new U32(unwrapChain)).bytes, count);
        count += 4;
      }

      return buffer.slice(0, count);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      const streamError = new Error(`ExtensionHelper.token.receive.decode: invalid stream`);
      let offset = 0;
      const length = array.length;

      const chain = new U32();
      let error = chain.fromArray(array, offset);
      if (error) throw streamError;
      offset += chain.size;
      value.chain = ChainHelper.toChainStr(chain.toNumber());
      if (!value.chain) {
        throw new Error(`ExtensionHelper.token.receive.decode: invalid chain=${chain.toNumber()}`);
      }

      if (offset + 1 > length) {
        throw streamError;
      }
      const type = array[offset];
      offset += 1;
      value.type = TokenHelper.toTypeStr(type);
      if (!value.type) {
        throw new Error(`ExtensionHelper.token.receive.decode: invalid type=${type}`);
      }

      const address = new U256();
      error = address.fromArray(array, offset);
      if (error) throw streamError;
      offset += address.size;
      value.address_raw = address.toHex();
      let ret = ChainHelper.rawToAddress(value.chain, address);
      if (ret.error || !ret.address) {
        throw new Error(`ExtensionHelper.token.receive.decode: invalid address=${value.address_raw}`);
      }
      value.address = ret.address;

      if (offset + 1 > length) {
        throw streamError;
      }
      const source = array[offset];
      offset += 1;
      value.source = TokenHelper.toSourceStr(source);
      if (!value.source) {
        throw new Error(`ExtensionHelper.token.receive.decode: invalid source=${source}`);
      }

      const from = new U256();
      error = from.fromArray(array, offset);
      if (error) throw streamError;
      offset += from.size;
      value.from_raw = from.toHex();

      const blockHeight = new U64();
      error = blockHeight.fromArray(array, offset);
      if (error) throw streamError;
      offset += blockHeight.size;
      value.block_height = blockHeight.toDec();

      const txHash = new U256();
      error = txHash.fromArray(array, offset);
      if (error) throw streamError;
      offset += txHash.size;
      value.tx_hash = txHash.toHex();

      const tokenValue = new U256();
      error = tokenValue.fromArray(array, offset);
      if (error) throw streamError;
      offset += tokenValue.size;
      value.value = tokenValue.toDec();

      let fromChain = '';
      if (TokenHelper.isLocalSource(source)) {
        fromChain = environment.current_chain;
      } else if (source === TokenSource.MAP) {
        fromChain = value.chain;
      } else if (source === TokenSource.UNWRAP) {
        const unwrapChain = new U32();
        error = unwrapChain.fromArray(array, offset);
        if (error) throw streamError;
        offset += unwrapChain.size;
        value.unwrap_chain = ChainHelper.toChainStr(unwrapChain.toNumber());
        if (!value.unwrap_chain) {
          throw new Error(`ExtensionHelper.token.receive.decode: invalid unwrap_chain=${unwrapChain.toNumber()}`);
        }
        fromChain = value.unwrap_chain;
      } else {
        throw new Error(`ExtensionHelper.token.receive.decode: invalid source=${source}`);
      }

      ret = ChainHelper.rawToAddress(fromChain, from);
      if (ret.error || !ret.address) {
        throw new Error(`ExtensionHelper.token.receive.decode: invalid from=${value.from_raw}`);
      }
      value.from = ret.address;

      if (offset !== array.length) throw streamError;
    }
  },

  swap: {
    encode : (value: any) => {
      if (!value.sub_op || typeof value.sub_op !== 'string') {
        throw new Error(`ExtensionHelper.token.swap.encode: invalid sub_op=${value.sub_op}`);
      }

      if (!tokenSwapExtensionCodecs[value.sub_op]) {
        throw new Error(`ExtensionHelper.token.swap.encode: codec missing, sub_op=${value.sub_op}`);
      }

      return tokenSwapExtensionCodecs[value.sub_op].encode(value);
    },

    decode: (array: Uint8Array, value: {[key: string]: string}) => {
      if (array.length < 1) {
        throw new Error(`ExtensionHelper.token.swap.decode: bad length`);
      }
      value.sub_op = TokenHelper.toSwapSubOpStr(array[0]);
      if (!value.sub_op) {
        throw new Error(`ExtensionHelper.token.swap.decode: unknown sub_op=${array[0]}`);
      }

      if (!tokenSwapExtensionCodecs[value.sub_op]) {
        throw new Error(`ExtensionHelper.token.swap.decode: codec missing, sub_op=${value.sub_op}`);
      }

      tokenSwapExtensionCodecs[value.sub_op].decode(array.slice(1), value);
    }
  },

}

interface ExtensionCodec {
  encode(value: any): Uint8Array;
  decode(array: Uint8Array): string | object;
}

const extensionCodecs: {[codec: string]: ExtensionCodec} = {
  hex: {
    encode: (str: string) => {return hexToUint8(str);},
    decode: (array: Uint8Array) => {return uint8ToHex(array);}
  },

  utf8: {
    encode: (str: string) => {return new TextEncoder().encode(str);},
    decode: (array: Uint8Array) => {return new TextDecoder('utf-8', {fatal: true}).decode(array);}
  },

  dec64: {
    encode: (str: string) => {return new U64(str).bytes;},
    decode: (array: Uint8Array) => {
      let u64 = new U64();
      if (u64.fromArray(array, 0)) {
        throw new Error(`ExtensionHelper.dec64.decode: bad parameters=${array}`);
      }
      return u64.toDec();
    }
  },

  alias: {
    encode: (value: {op: string, op_value: string}) => {
      let buffer = new Uint8Array(1024);
      let count = 0;
      if (value.op === ExtensionAliasOpStr.NAME){
        count += 1;
        buffer.set([ExtensionAliasOp.NAME]);
      } else if (value.op === ExtensionAliasOpStr.DNS) {
        count += 1;
        buffer.set([ExtensionAliasOp.DNS]);
      } else {
        throw new Error(`ExtensionHelper.alias.encode: unknown op=${value.op}`);
      }
      const op_value = new TextEncoder().encode(value.op_value);
      buffer.set(op_value, count);
      count += op_value.length;
      return buffer.slice(0, count);
    },
    decode: (array: Uint8Array) => {
      if (array.length < 1) {
        throw new Error(`ExtensionHelper.alias.decode: bad length`);
      }

      const value: any = {}
      if (array[0] == ExtensionAliasOp.NAME) {
        value.op = ExtensionAliasOpStr.NAME
      } else if (array[0] == ExtensionAliasOp.DNS) {
        value.op = ExtensionAliasOpStr.DNS;
      } else {
        throw new Error(`ExtensionHelper.alias.decode: unknown op=${array[0]}`);
      }

      value.op_value = new TextDecoder('utf-8', {fatal: true}).decode(array.slice(1));

      return value;
    }
  },

  token: {
    encode : (value: any) => {
      if (!value.op || typeof value.op !== 'string') {
        throw new Error(`ExtensionHelper.token.encode: invalid op=${value.op}`);
      }

      if (!tokenExtensionCodecs[value.op]) {
        throw new Error(`ExtensionHelper.token.encode: codec missing, op=${value.op}`);
      }

      return tokenExtensionCodecs[value.op].encode(value);
    },
    decode :  (array: Uint8Array) => {
      if (array.length <= 1) {
        throw new Error(`ExtensionHelper.token.decode: bad length`);
      }
      const value: any = {}
      value.op = TokenHelper.toOpStr(array[0]);
      if (!value.op) {
        throw new Error(`ExtensionHelper.token.decode: unknown op=${array[0]}`);
      }

      if (!tokenExtensionCodecs[value.op]) {
        throw new Error(`ExtensionHelper.token.decode: codec missing, op=${value.op}`);
      }

      tokenExtensionCodecs[value.op].decode(array.slice(1), value);
      return value;
    }
  }
};

type ExtensionTypeMap = [ExtensionType, ExtensionTypeStr, ExtensionCodec];
const extensionTypeMaps: ExtensionTypeMap[] = [
  [ExtensionType.SUB_ACCOUNT, ExtensionTypeStr.SUB_ACCOUNT, extensionCodecs.utf8],
  [ExtensionType.NOTE, ExtensionTypeStr.NOTE, extensionCodecs.utf8],
  [ExtensionType.ALIAS, ExtensionTypeStr.ALIAS, extensionCodecs.alias],
  [ExtensionType.TOKEN, ExtensionTypeStr.TOKEN, extensionCodecs.token]
]

export enum ExtensionError {
  TYPE = 'type',
  LENGTH = 'length',
  VALUE = 'value',
}

export interface Extension {
  type: string;
  length: string;
  value: string | object;
  error?: ExtensionError;
}

export class ExtensionHelper {
  static decode(array: Uint8Array, offset: number): Extension {
    let e: Extension = {type: ExtensionTypeStr.INVALID, length: '0', value: ''};
    let type = new U16();
    let length = new U16();

    let error = type.fromArray(array, offset);
    if (error) return {...e, error: ExtensionError.TYPE};
    e.type = type.toExtensionTypeStr();

    error = length.fromArray(array, offset + type.size);
    if (error) return {...e, error: ExtensionError.LENGTH};

    let value_offset = offset + type.size + length.size;
    if (array.length < value_offset + length.toNumber()) {
      return {...e, error: ExtensionError.LENGTH};
    }
    e.length = length.toDec();

    let codec = extensionCodecs.hex;
    let map = extensionTypeMaps.find(x => x[0] === type.toNumber());
    if (map) codec = map[2];
    try {
      e.value = codec.decode(array.slice(value_offset, value_offset + length.toNumber()));
    }
    catch (err) {
      console.log(`ExtensionHelper.decode: exception=${err}`)
      return {...e, error: ExtensionError.VALUE};
    }
    
    return e;
  }

  static encodeHex(str: string): Uint8Array {
    return extensionCodecs.hex.encode(str);
  }

  static encode(json: any): Uint8Array {
    let error_result = new Uint8Array(0);
    if (json.error) return error_result;

    let type = new U16();
    let error = type.fromExtensionTypeStr(json.type);
    if (error) return error_result;

    let codec = extensionCodecs.hex;
    let map = extensionTypeMaps.find(x => x[0] === type.toNumber());
    if (map) codec = map[2];

    try {
      let value = codec.encode(json.value);
      let length = new U16(value.length);
      let result = new Uint8Array(type.size + length.size + value.length);
      result.set(type.bytes);
      result.set(length.bytes, type.size);
      result.set(value, type.size + length.size);
      return result;
    }
    catch (err) {
      console.log(`ExtensionHelper.encode: exception=${err}`)
      return error_result;
    }
  }

}

export enum AppTopicType {
    INVALID                 = 0,
    ORDER_PAIR              = 1,
    ORDER_ID                = 2,
    ACCOUNT_SWAP_INFO       = 3,
    ACCOUNT_HEAD            = 4,
    ACCOUNT_TOKEN_BALANCE   = 5,

    MAX
};

export class AppHelper {
  static calcTopic(type: AppTopicType, ...data: (Uall|Uint8Array)[]): U256 {
    let buffer = new Uint8Array(1024);
    let count = 0;
    
    buffer.set(new U32(type).bytes, count);
    count += 4;

    for (let i of data) {
      if (i instanceof Uint8Array) {
        buffer.set(i, count);
        count += i.length;
      } else {
        buffer.set(i.bytes, count);
        count += i.bytes.length;  
      }
    }

    const result = new U256();
    result.bytes = uint8ToHash(buffer.slice(0, count));
    return result;
  }

  static SWAP_PING_PONG_INTERVAL = 60;
  static SWAP_TIMEOUT = 100;
}