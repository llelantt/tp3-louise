import { inflateRawSync } from "node:zlib";
import { UpstreamError } from "../lib/errors.js";

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const UINT32_MAX = 0xffffffff;

export interface ZipEntry {
  name: string;
  data: Buffer;
}

function findEocd(buffer: Buffer): number {
  if (buffer.length < 22) {
    throw new UpstreamError("Archive ZIP invalide : trop courte");
  }
  const minOffset = Math.max(0, buffer.length - 22 - 65535);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new UpstreamError("Archive ZIP invalide : fin de repertoire introuvable");
}

function readEntry(
  buffer: Buffer,
  name: string,
  method: number,
  compressedSize: number,
  uncompressedSize: number,
  localOffset: number,
  maxUncompressedBytes: number,
): ZipEntry {
  if (compressedSize === UINT32_MAX || uncompressedSize === UINT32_MAX) {
    throw new UpstreamError("Archive ZIP64 non supportee");
  }
  if (uncompressedSize > maxUncompressedBytes) {
    throw new UpstreamError(
      `Archive trop grande une fois decompressee (${uncompressedSize} > ${maxUncompressedBytes})`,
    );
  }
  if (buffer.readUInt32LE(localOffset) !== LOC_SIG) {
    throw new UpstreamError("Archive ZIP invalide : en-tete local corrompu");
  }

  const localNameLength = buffer.readUInt16LE(localOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

  let data: Buffer;
  if (method === 0) {
    data = Buffer.from(compressed);
  } else if (method === 8) {
    try {
      data = inflateRawSync(compressed);
    } catch {
      throw new UpstreamError("Archive ZIP invalide : decompression deflate impossible");
    }
  } else {
    throw new UpstreamError(`Methode de compression ZIP non supportee : ${method}`);
  }

  if (data.length > maxUncompressedBytes) {
    throw new UpstreamError("Archive trop grande une fois decompressee");
  }
  return { name, data };
}

/** Extrait la premiere entree .xml d'une archive ZIP, avec garde anti zip-bomb. */
export function extractXmlFromZip(buffer: Buffer, maxUncompressedBytes: number): ZipEntry {
  const eocd = findEocd(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== CEN_SIG) {
      throw new UpstreamError("Archive ZIP invalide : entree de repertoire corrompue");
    }
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    if (name.toLowerCase().endsWith(".xml")) {
      return readEntry(
        buffer,
        name,
        method,
        compressedSize,
        uncompressedSize,
        localOffset,
        maxUncompressedBytes,
      );
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new UpstreamError("Archive ZIP invalide : aucune entree XML");
}
