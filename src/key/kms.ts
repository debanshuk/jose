import {DataKeySpec, GenerateDataKeyCommand, GenerateDataKeyCommandOutput, KMSClient} from "@aws-sdk/client-kms";

export class KmsAccessor {
    protected readonly kmsClient: KMSClient;
    protected static readonly encToDataKeySpecMap = new Map([
        ['A256GCM', DataKeySpec.AES_256],
        ['A128GCM', DataKeySpec.AES_128]
    ]);

    constructor(kmsCLient: KMSClient) {
        this.kmsClient = kmsCLient;
    }

    async generateDataKey(keyId: string, enc: string): Promise<{cek: Uint8Array, encryptedKey: Uint8Array}> {
        const output: GenerateDataKeyCommandOutput = await this.kmsClient.send(new GenerateDataKeyCommand({
            KeyId: keyId,
            KeySpec: KmsAccessor.encToDataKeySpecMap.get(enc)
        }));

        if (!output.Plaintext || !output.CiphertextBlob) {
            throw new ReferenceError(`Invalid output from KMS: ${output}`);
        }
        return {cek: output.Plaintext, encryptedKey: output.CiphertextBlob};
    }
}
