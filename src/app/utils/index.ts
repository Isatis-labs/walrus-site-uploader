import { U256, Deserializer } from '@aptos-labs/ts-sdk'
import { bcs } from '@mysten/bcs'
import { Base64 } from 'js-base64'
import { PACKAGEID } from '../const'
import { Transaction } from '@mysten/sui/transactions'
import mime from 'mime'
export interface FileContent {
  name: string
  path: string
  content: string
  fileHash: string
  blobId?: string
  upload_waiting?: boolean
}

export const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

/**
 * blobid转u256
 * @param blobId
 * @returns u256
 */
export function get_blob(base64_blob: string): string {
  return bcs.u256().fromHex(
    U256.deserialize(new Deserializer(Base64.toUint8Array(base64_blob)))
      .bcsToHex()
      .toString(),
  )
}

/**
 * 文件转256
 * @param file 文件
 * @returns 文件转u256
 */
export const get_file_hash = async (file: File) => {
  // 读取文件内容为 ArrayBuffer
  const arrayBuffer = await file.arrayBuffer()

  // 使用 Web Crypto API 计算哈希
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)

  // 将哈希值转换为十六进制字符串
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return bcs
    .u256()
    .fromHex(
      hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join(''),
    )
}

/**
 * objectId转base36
 * @param str objectid 0xf4295211a0e122e2cee6d1a31d3557d8a5878b0d5aa278c298b86bc6dfdad70d
 * @returns base64编码 632r7wi80x67dwpwnb6ujznedzjcivr0jik0g6hzuz5peijaq5
 */
export const addressToBase36 = (str: string) => {
  // https://sdk.mystenlabs.com/bcs#transforms
  const hex = BigInt(str)
  return hex.toString(36)
}

/**
 * 构建交易
 * @param param0 data-文件数据 owner-钱包地址
 * @returns txb
 */
export function build_txn({
  data,
  owner,
}: {
  data: {
    name: string
    blobId: string
    fileHash: string
  }[]
  owner: string
}): Transaction {
  const txb = new Transaction()
  const site = txb.moveCall({
    package: PACKAGEID,
    module: 'site',
    function: 'new_site',
    arguments: [txb.pure.string('test page')],
  })
  data.forEach((item) => {
    // 先调用new_range_option
    const newRange = txb.moveCall({
      package: PACKAGEID,
      module: 'site',
      function: 'new_range_option',
      arguments: [txb.pure.vector('u64', []), txb.pure.vector('u64', [])],
    })
    // 再调用 new_resource
    const resource = txb.moveCall({
      package: PACKAGEID,
      module: 'site',
      function: 'new_resource',
      arguments: [
        txb.pure.string(`/${item.name}`),
        txb.pure.u256(get_blob(item.blobId)),
        txb.pure.u256(item.fileHash),
        newRange,
      ],
    })
    // 再调用 add_header content-encoding: identity
    txb.moveCall({
      package: PACKAGEID,
      module: 'site',
      function: 'add_header',
      arguments: [
        resource,
        txb.pure.string('content-encoding'),
        txb.pure.string('identity'),
      ],
    })
    // 再调用 add_header mime
    txb.moveCall({
      package: PACKAGEID,
      module: 'site',
      function: 'add_header',
      arguments: [
        resource,
        txb.pure.string('content-type'),
        txb.pure.string(mime.getType(item.name) || ''),
      ],
    })
    txb.moveCall({
      package: PACKAGEID,
      module: 'site',
      function: 'add_resource',
      arguments: [site, resource],
    })
  })

  txb.transferObjects([site], txb.pure.address(owner))
  return txb
}
