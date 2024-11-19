// src/components/FileUpload.js
import React, {
  Dispatch,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Box,
  Button,
  Divider,
  Flex,
  Heading,
  Input,
  Link,
  Spinner,
  Text,
  VStack,
  useSteps,
  useToast,
} from '@chakra-ui/react'
import {
  build_txn,
  FileContent,
  get_file_hash,
  addressToBase36,
  readFileAsText,
} from './utils'
import { steps, UploadStepper } from './stepper'
import {
  ConnectModal,
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit'
import { PACKAGEID } from './const'

const FileUpload = () => {
  const [files, setFiles] = useState<FileContent[] | null>(null)
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const account = useCurrentAccount()
  const [open, setOpen] = useState(false)
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction()
  const client = useSuiClient()
  const [digest, setDigest] = useState('')
  const [url, setUrl] = useState('')

  const [upload_loading, setUpload_loading] = useState(false)
  const [objectId, setObjectId] = useState('')

  const { activeStep, setActiveStep } = useSteps({
    index: 0,
    count: steps.length,
  })

  useEffect(() => {
    if (!input.current) {
      return
    }
    input.current.setAttribute('webkitdirectory', '')
  }, [input])

  useEffect(() => {
    if (
      files &&
      files?.length > 0 &&
      files?.filter((file) => file.blobId).length === files?.length
    ) {
      setActiveStep(2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const rawFiles = Array.from(event?.currentTarget?.files || [])
    const data: FileContent[] = []
    for (const file of rawFiles) {
      const content = await readFileAsText(file)
      const fileHash = await get_file_hash(file)
      data.push({
        name: file.name,
        path: `${file.webkitRelativePath.split('/').slice(1).join('/')}`,
        content: content,
        fileHash,
      })
    }
    console.log(data)
    setFiles(data)
    setObjectId('')
    setDigest('')
    setUrl('')
    setActiveStep(1)
  }

  const handleUpload_walrus = async ({ data }: { data: FileContent[] }) => {
    if (!data) {
      return
    }

    setUpload_loading(true)

    try {
      // 直接异步干
      for (const e of data) {
        if (e.blobId) {
          continue
        }

        setFiles((prev) => {
          return prev!.map((file) => {
            if (file.path === e.path) {
              return {
                ...file,
                upload_waiting: true,
              }
            }
            return file
          })
        })

        const response = await fetch(
          'https://publisher.walrus-testnet.walrus.space/v1/store',
          {
            method: 'PUT',
            body: e.content,
          },
        )
        const json = await response.json()

        console.log(
          json?.alreadyCertified?.blobId ||
            json?.newlyCreated.blobObject.blobId,
        )

        setFiles((prev) => {
          return prev!.map((file) => {
            if (file.path === e.path) {
              return {
                ...file,
                blobId:
                  json?.alreadyCertified?.blobId ||
                  json?.newlyCreated.blobObject.blobId,
                upload_waiting: false,
              }
            }
            return file
          })
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setUpload_loading(false)
    }
  }

  const handleUpload = async ({ data }: { data: FileContent[] }) => {
    const files = data.map((file) => {
      return {
        name: file.path,
        blobId: file.blobId!,
        fileHash: file.fileHash,
      }
    })

    setUpload_loading(true)
    signAndExecuteTransaction(
      {
        transaction: build_txn({
          data: files,
          owner: account?.address || '',
        }),
      },
      {
        onSuccess: async (result) => {
          console.log('executed transaction', result)
          const transaction = await client.waitForTransaction({
            digest: result.digest,
            options: {
              showObjectChanges: true,
            },
          })
          const object = transaction.objectChanges?.find((change) => {
            if ('objectType' in change) {
              return change.objectType == `${PACKAGEID}::site::Site`
            }
            return false
          })
          setDigest(result.digest)
          setUpload_loading(false)
          if (object) {
            setObjectId('objectId' in object ? object.objectId : '')
            setUrl(
              `https://${addressToBase36('objectId' in object ? object.objectId : '')}.walrus.site/`,
            )
          }
          setActiveStep(3)
        },
        onError: (error) => {
          console.error('error', error)
          setUpload_loading(false)
        },
        onSettled: () => {},
      },
    )
  }

  return (
    <VStack
      spacing={4}
      align="stretch"
      maxWidth={'900px'}
      width={'100%'}
      height={'100%'}
      justifyContent={'center'}
      alignItems={'center'}
    >
      <Flex
        borderWidth="1px"
        borderRadius="md"
        p="4"
        cursor="pointer"
        _hover={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
        bg="transparent"
        onClick={() => input.current?.click()}
        minHeight={'150px'}
        maxHeight="200px"
        width={'100%'}
      >
        <Input
          type="file"
          onChange={handleFileChange}
          ref={input}
          border="none"
          bg="transparent"
          display="none"
          width={'100%'}
        />
        <Text cursor="pointer" textAlign="center" width="100%">
          Click to upload the site folder
        </Text>
      </Flex>
      <UploadStepper
        activeStep={activeStep}
        setActiveStep={setActiveStep as Dispatch<SetStateAction<number>>}
      />
      {activeStep != 0 && (
        <Button
          colorScheme="teal"
          width={'100%'}
          height={'80px'}
          isLoading={upload_loading}
          onClick={async () => {
            if (activeStep === 1) {
              handleUpload_walrus({ data: files || [] })
            } else if (activeStep === 2) {
              if (account?.address) {
                handleUpload({ data: files || [] })
              } else {
                setOpen(true)
              }
            } else if (activeStep === 3) {
              await navigator.clipboard.writeText(url)
              toast({
                title: 'Copied',
                description: `${url} is copied to clipboard`,
                status: 'success',
                duration: 2000,
                isClosable: true,
              })
            }
          }}
        >
          {`${activeStep == 1 ? 'Upload to Walrus' : activeStep == 2 ? (account?.address ? 'Upload to Chain' : 'Connect Wallet') : activeStep == 3 ? `${url ? url : 'Finish'}` : 'Wait for selection'}`}
        </Button>
      )}
      <Text> {digest} </Text>
      {objectId && <Text> ObjectId:{objectId}</Text>}
      {url && (
        <Link href={url} target="_blank">
          {url}
        </Link>
      )}
      <ConnectModal
        trigger={<></>}
        open={open}
        onOpenChange={(isOpen) => setOpen(isOpen)}
      />
      <Flex
        width="100%"
        height={'100%'}
        maxHeight={'400px'}
        flexDirection={'column'}
        borderWidth={'1px'}
        rounded={'lg'}
      >
        <Flex width={'100%'} justifyContent={'space-between'}>
          <Heading width={'100%'} padding={'1rem'} size={'lg'}>
            Selected Files
          </Heading>
          {files && (
            <Heading width={'100%'} padding={'1rem'} size={'md'}>
              Total {files?.length} Files
            </Heading>
          )}
        </Flex>

        <Divider />
        <Box
          display={'flex'}
          gap={'0.5rem'}
          flexDirection={'column'}
          overflowY="scroll"
          maxHeight="500px"
          borderRadius="md"
          style={{
            msScrollbarTrackColor: 'f1f1f1',
          }}
        >
          {files &&
            files.map((file) => {
              return (
                <Flex
                  key={file.path}
                  height={'55px'}
                  width="100%"
                  flexDirection={'row'}
                  style={{
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                  gap={'0.5rem'}
                >
                  <Flex
                    borderWidth={'1px'}
                    width="100%"
                    padding={'1rem'}
                    justifyContent={'space-between'}
                  >
                    <Text isTruncated>{file.path}</Text>
                    <Text isTruncated>
                      {file.blobId ? (
                        file.blobId
                      ) : file.upload_waiting ? (
                        <Spinner />
                      ) : (
                        'Waiting for upload'
                      )}
                    </Text>
                  </Flex>
                </Flex>
              )
            })}
        </Box>
      </Flex>
    </VStack>
  )
}

export default FileUpload
