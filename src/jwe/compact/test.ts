// Note: Copy and paste this in a node shell.

let kms = require("@aws-sdk/client-kms");
let index = require("./");

let jwePromise = new index.CompactEncrypt(
        new TextEncoder().encode('It’s a dangerous business, Frodo, going out your door.')
    ).setProtectedHeader({
        alg: 'SYMMETRIC_DEFAULT', enc: 'A256GCM',
        kid: '<KMS Key ARN>'
    }).setKmsAccessor(
        new index.KmsAccessor(new kms.KMSClient({region: 'eu-west-1'}))
    ).encrypt(
        '<KMS Key ARN>'
    );

jwePromise.then((jwe) => console.log(jwe));
