import { useState, useEffect } from "react";
import { Button, VStack, Input } from "@chakra-ui/react";
import LitJsSdk, { encryptString } from "lit-js-sdk";
import { uploadIpfs } from "./ipfs";
import axios from "axios";
function App() {
    const [authSig, setAuthSig] = useState(undefined);
    const [inputValue, setInputValue] = useState("");
    const [URLValue, setURLValue] = useState("");
    const [decryptedOutput, setDecryptedOutput] = useState("");
    function inputHandler(value, setter) {
        setter(value);
    }

    useEffect(() => {
        console.log("mount");
        (async () => {
            await connectToLit();
        })();

        return () => {
            console.log("unmount");
        };
    }, []);

    async function connectToLit() {
        const client = new LitJsSdk.LitNodeClient();
        await client.connect();
        window.litNodeClient = client;
        var authSig = await LitJsSdk.checkAndSignAuthMessage({
            chain: "ethereum",
        });
        setAuthSig(authSig);
    }

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (_e) => resolve(reader.result);
            reader.onerror = (_e) => reject(reader.error);
            reader.onabort = (_e) => reject(new Error("Read aborted"));
            reader.readAsDataURL(blob);
        });
    }

    function dataURLtoBlob(dataurl) {
        var arr = dataurl.split(","),
            mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]),
            n = bstr.length,
            u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    async function encrypt() {
        const { encryptedString, symmetricKey } = await LitJsSdk.encryptString(
            inputValue
        );
        await uploadToLit(symmetricKey, encryptedString);
    }

    async function uploadToLit(symmetricKey, encryptedString) {
        const accessControlConditions = [
            {
                contractAddress: "",
                standardContractType: "",
                chain: "ethereum",
                method: "eth_getBalance",
                parameters: [":userAddress", "latest"],
                returnValueTest: {
                    comparator: ">=",
                    value: "0",
                },
            },
        ];
        const encryptedSymmetricKey =
            await window.litNodeClient.saveEncryptionKey({
                accessControlConditions,
                symmetricKey,
                authSig,
                chain: "ethereum",
            });

        uploadDecryptionDataToIpfs(
            encryptedString,
            encryptedSymmetricKey, // uint8Array
            accessControlConditions
        );
    }

    async function uploadDecryptionDataToIpfs(
        encryptedString,
        encryptedSymmetricKey,
        accessControlConditions
    ) {
        let encryptedData = await blobToDataURL(encryptedString);

        const packagedData = JSON.stringify({
            encryptedData,
            encryptedSymmetricKey,
            accessControlConditions,
        });

        let result = await uploadIpfs(packagedData);
        console.log(result.path);
    }

    async function decrypt() {
        let { data } = await axios.get(URLValue);
        let parsedData = JSON.parse(data);
        const chain = "ethereum";
        let { encryptedSymmetricKey, encryptedData, accessControlConditions } =
            parsedData;

        const symmetricKey = await window.litNodeClient.getEncryptionKey({
            accessControlConditions,
            toDecrypt: LitJsSdk.uint8arrayToString(
                new Uint8Array(Object.values(encryptedSymmetricKey)),
                "base16"
            ),
            chain,
            authSig,
        });

        const decryptedString = await LitJsSdk.decryptString(
            dataURLtoBlob(encryptedData),
            symmetricKey
        );

        setDecryptedOutput(decryptedString);
    }

    return (
        <VStack height="100vh" alignItems="center" justifyContent="center">
            <Button onClick={connectToLit}>Lit</Button>
            <Input
                value={inputValue}
                onChange={(e) => inputHandler(e.target.value, setInputValue)}
                maxWidth="400px"
            />
            <Button onClick={encrypt}>Encrypt</Button>
            <Input
                value={URLValue}
                onChange={(e) => inputHandler(e.target.value, setURLValue)}
                maxWidth="400px"
            />
            <Button onClick={decrypt}>Decrypt</Button>
            <p>{decryptedOutput}</p>
        </VStack>
    );
}

export default App;
