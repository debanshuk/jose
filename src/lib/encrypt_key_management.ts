import { wrap as aesKw } from '../runtime/aeskw.js'
import * as ECDH from '../runtime/ecdhes.js'
import { encrypt as pbes2Kw } from '../runtime/pbes2kw.js'
import { encrypt as rsaEs } from '../runtime/rsaes.js'
import { encode as base64url } from '../runtime/base64url.js'

import type {
  KeyLike,
  JWEKeyManagementHeaderParameters,
  JWEHeaderParameters,
  JWK,
} from '../types.d'
import generateCek, { bitLength as cekLength } from '../lib/cek.js'
import {JOSEAlgNotAllowed, JOSENotSupported} from '../util/errors.js'
import { exportJWK } from '../key/export.js'
import checkKeyType from './check_key_type.js'
import { wrap as aesGcmKw } from './aesgcmkw.js'
import {KmsAccessor} from "../key/kms";

async function encryptKeyManagement(
  alg: string,
  enc: string,
  key: KeyLike | Uint8Array | string,
  providedCek?: Uint8Array,
  providedParameters: JWEKeyManagementHeaderParameters = {},
  kmsAccessor?: KmsAccessor
): Promise<{
  cek: KeyLike | Uint8Array
  encryptedKey?: Uint8Array
  parameters?: JWEHeaderParameters
}> {
  let encryptedKey: Uint8Array | undefined
  let parameters: (JWEHeaderParameters & { epk?: JWK }) | undefined
  let cek: KeyLike | Uint8Array

  if (typeof key === 'string') {
    switch (alg) {
      case 'SYMMETRIC_DEFAULT': {
        if (!kmsAccessor) {
          throw new JOSEAlgNotAllowed(`KMS Accessor is required with alg: ${alg}`);
        }
        ({cek, encryptedKey} = await kmsAccessor.generateDataKey(key, enc))
        break
      }
      default: {
        throw new JOSENotSupported('Invalid or unsupported "alg" (JWE Algorithm) header value')
      }
    }

    return { cek, encryptedKey, parameters }
  }

  checkKeyType(alg, key, 'encrypt')

  switch (alg) {
    case 'dir': {
      // Direct Encryption
      cek = key
      break
    }
    case 'ECDH-ES':
    case 'ECDH-ES+A128KW':
    case 'ECDH-ES+A192KW':
    case 'ECDH-ES+A256KW': {
      // Direct Key Agreement
      if (!ECDH.ecdhAllowed(key)) {
        throw new JOSENotSupported(
          'ECDH with the provided key is not allowed or not supported by your javascript runtime',
        )
      }
      const { apu, apv } = providedParameters
      let { epk: ephemeralKey } = providedParameters
      ephemeralKey ||= (await ECDH.generateEpk(key)).privateKey
      const { x, y, crv, kty } = await exportJWK(ephemeralKey!)
      const sharedSecret = await ECDH.deriveKey(
        key,
        ephemeralKey,
        alg === 'ECDH-ES' ? enc : alg,
        alg === 'ECDH-ES' ? cekLength(enc) : parseInt(alg.slice(-5, -2), 10),
        apu,
        apv,
      )
      parameters = { epk: { x, crv, kty } }
      if (kty === 'EC') parameters.epk!.y = y
      if (apu) parameters.apu = base64url(apu)
      if (apv) parameters.apv = base64url(apv)

      if (alg === 'ECDH-ES') {
        cek = sharedSecret
        break
      }

      // Key Agreement with Key Wrapping
      cek = providedCek || generateCek(enc)
      const kwAlg = alg.slice(-6)
      encryptedKey = await aesKw(kwAlg, sharedSecret, cek)
      break
    }
    case 'RSA1_5':
    case 'RSA-OAEP':
    case 'RSA-OAEP-256':
    case 'RSA-OAEP-384':
    case 'RSA-OAEP-512': {
      // Key Encryption (RSA)
      cek = providedCek || generateCek(enc)
      encryptedKey = await rsaEs(alg, key, cek)
      break
    }
    case 'PBES2-HS256+A128KW':
    case 'PBES2-HS384+A192KW':
    case 'PBES2-HS512+A256KW': {
      // Key Encryption (PBES2)
      cek = providedCek || generateCek(enc)
      const { p2c, p2s } = providedParameters
      ;({ encryptedKey, ...parameters } = await pbes2Kw(alg, key, cek, p2c, p2s))
      break
    }
    case 'A128KW':
    case 'A192KW':
    case 'A256KW': {
      // Key Wrapping (AES KW)
      cek = providedCek || generateCek(enc)
      encryptedKey = await aesKw(alg, key, cek)
      break
    }
    case 'A128GCMKW':
    case 'A192GCMKW':
    case 'A256GCMKW': {
      // Key Wrapping (AES GCM KW)
      cek = providedCek || generateCek(enc)
      const { iv } = providedParameters
      ;({ encryptedKey, ...parameters } = await aesGcmKw(alg, key, cek, iv))
      break
    }
    default: {
      throw new JOSENotSupported('Invalid or unsupported "alg" (JWE Algorithm) header value')
    }
  }

  return { cek, encryptedKey, parameters }
}

export default encryptKeyManagement
