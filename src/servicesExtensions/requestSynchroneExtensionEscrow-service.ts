import config from '../config';
import * as Types from '../types';
import Artifacts from '../artifacts';
import * as Web3PromiEvent from 'web3-core-promievent';
// import * as ServicesContracts from '../servicesContracts';
import RequestCoreService from '../servicesCore/requestCore-service';

const requestCore_Artifact = Artifacts.RequestCoreArtifact;
const requestSynchroneExtensionEscrow_Artifact = Artifacts.RequestSynchroneExtensionEscrowArtifact;

import { Web3Single } from '../servicesExternal/web3-single';

const BN = Web3Single.BN();

/**
 * The RequestSynchroneExtensionEscrowService class is the interface for the Request Escrow Synchrone extension 
 */
export default class RequestSynchroneExtensionEscrowService {
    protected web3Single: any;

    // RequestEthereum on blockchain
    /**
     * RequestCore contract's abi
     */
    protected abiRequestCore: any;
    /**
     * RequestCore service from this very lib
     */
    protected requestCoreServices:any;

    // RequestSynchroneExtensionEscrow on blockchain
    /**
     * RequestSynchroneExtensionEscrow contract's abi
     */
    protected abiSynchroneExtensionEscrow: any;
    /**
     * RequestSynchroneExtensionEscrow contract's address
     */
    protected addressSynchroneExtensionEscrow: string;
    /**
     * RequestSynchroneExtensionEscrow contract's web3 instance
     */
    protected instanceSynchroneExtensionEscrow: any;

    /**
     * constructor to Instantiates a new RequestSynchroneExtensionEscrowService 
     */
    constructor() {
        this.web3Single = Web3Single.getInstance();

        this.abiRequestCore = requestCore_Artifact.abi;
        this.requestCoreServices = new RequestCoreService();

        this.abiSynchroneExtensionEscrow = requestSynchroneExtensionEscrow_Artifact.abi;
        if(!requestSynchroneExtensionEscrow_Artifact.networks[this.web3Single.networkName]) {
            throw Error('requestSynchroneExtensionEscrow Artifact does not have configuration for network : "'+this.web3Single.networkName+'"');
        }
        this.addressSynchroneExtensionEscrow = requestSynchroneExtensionEscrow_Artifact.networks[this.web3Single.networkName].address;
        this.instanceSynchroneExtensionEscrow = new this.web3Single.web3.eth.Contract(this.abiSynchroneExtensionEscrow, this.addressSynchroneExtensionEscrow);
    }


    /**
     * parse extension parameters (generic method)
     * @param   _extensionParams    array of parameters for the extension (optional)
     * @return  return object with array of the parsed parameters
     */
    public parseParameters(_extensionParams: any[]): any {
        if(!_extensionParams || !this.web3Single.isAddressNoChecksum(_extensionParams[0])) {
            return {error:Error('first parameter must be a valid eth address')}
        }
        let ret: any[] = [];

        // parse escrow 
        ret.push(this.web3Single.toSolidityBytes32('address', _extensionParams[0]));

        for (let i = 1; i < 9; i++) {
            ret.push(this.web3Single.toSolidityBytes32('bytes32', 0));
        }
        return {result:ret};
    }

    /**
     * release payment to Payee as payer or escrow
     * @dev emit the event 'broadcasted' with {transactionHash} when the transaction is submitted
     * @param   _requestId         requestId of the request
     * @param   _options           options for the method (gasPrice, gas, value, from, numberOfConfirmation)
     * @return  promise of the object containing the request and the transaction hash ({request, transactionHash})
     */
    public releaseToPayeeAction(
        _requestId: string,
        _options ? : any): Web3PromiEvent {
        let promiEvent = Web3PromiEvent();
        _options = this.web3Single.setUpOptions(_options);

        this.web3Single.getDefaultAccountCallback((err,defaultAccount) => {
            if(!_options.from && err) return promiEvent.reject(err);
            let account = _options.from || defaultAccount;

            this.getRequest(_requestId).then(request => {
                if (err) return promiEvent.reject(err);

                if(!request.extension) {
                    return promiEvent.reject(Error('request doesn\'t have an extension'));
                }
                if(request.extension.address.toLowerCase() != this.addressSynchroneExtensionEscrow.toLowerCase()) {
                    return promiEvent.reject(Error('request\'s extension is not sync. escrow'));
                }
                if(!this.web3Single.areSameAddressesNoChecksum(account, request.payer) && account != request.extension.escrow) {
                    return promiEvent.reject(Error('account must be payer or escrow'));
                }
                if(request.extension.state != Types.EscrowState.Created) {
                    return promiEvent.reject(Error('Escrow state must be \'Created\''));
                }
                if(request.state != Types.State.Accepted) {
                    return promiEvent.reject(Error('State must be \'Accepted\''));
                }

                var method = this.instanceSynchroneExtensionEscrow.methods.releaseToPayee(_requestId);

                this.web3Single.broadcastMethod(
                    method,
                    (transactionHash: string) => {
                        return promiEvent.eventEmitter.emit('broadcasted',{ transactionHash: transactionHash});
                    },
                    (receipt: any) => {
                        // we do nothing here!
                    },
                    (confirmationNumber: number, receipt: any) => {
                        if (confirmationNumber == _options.numberOfConfirmation) {
                            var event = this.web3Single.decodeEvent(this.abiRequestCore, 'EscrowReleaseRequest', receipt.events[0]);
                            this.getRequest(event.requestId).then((request) => {
                                promiEvent.resolve({ request: request, transactionHash: receipt.transactionHash});
                            }).catch(e => {return promiEvent.reject(e)});
                        }
                    },
                    (error: Error) => {
                        return promiEvent.reject(error);
                    },
                    _options);
            }).catch(e => {return promiEvent.reject(e)});
        });

        return promiEvent.eventEmitter;
    }

    /**
     * release payment to payer as payee or escrow
     * @dev emit the event 'broadcasted' with {transactionHash} when the transaction is submitted
     * @param   _requestId         requestId of the request
     * @param   _options           options for the method (gasPrice, gas, value, from, numberOfConfirmation)
     * @return  promise of the object containing the request and the transaction hash ({request, transactionHash})
     */
    public releaseToPayerAction(
        _requestId: string,
        _options ? : any): Web3PromiEvent {
        let promiEvent = Web3PromiEvent();
        _options = this.web3Single.setUpOptions(_options);

        this.web3Single.getDefaultAccountCallback((err,defaultAccount) => {
            if(!_options.from && err) return promiEvent.reject(err);
            let account = _options.from || defaultAccount;

            this.getRequest(_requestId).then(request => {

                if(!request.extension) {
                    return promiEvent.reject(Error('request doesn\'t have an extension'));
                }
                if(request.extension.address.toLowerCase() != this.addressSynchroneExtensionEscrow.toLowerCase()) {
                    return promiEvent.reject(Error('request\'s extension is not sync. escrow'));
                }
                if(!this.web3Single.areSameAddressesNoChecksum(account, request.payee) && !this.web3Single.areSameAddressesNoChecksum(account, request.extension.escrow)) {
                    return promiEvent.reject(Error('account must be payee or escrow'));
                }
                if(request.extension.state != Types.EscrowState.Created) {
                    return promiEvent.reject(Error('Escrow state must be \'Created\''));
                }
                if(request.state != Types.State.Accepted) {
                    return promiEvent.reject(Error('State must be \'Accepted\''));
                }

                var method = this.instanceSynchroneExtensionEscrow.methods.releaseToPayerAction(_requestId);

                this.web3Single.broadcastMethod(
                    method,
                    (transactionHash: string) => {
                        return promiEvent.eventEmitter.emit('broadcasted',{ transactionHash: transactionHash});
                    },
                    (receipt: any) => {
                        // we do nothing here!
                    },
                    (confirmationNumber: number, receipt: any) => {
                        if (confirmationNumber == _options.numberOfConfirmation) {
                            var event = this.web3Single.decodeEvent(this.abiRequestCore, 'EscrowRefundRequest', receipt.events[0]);
                            this.getRequest(event.requestId).then((request) => {
                                promiEvent.resolve({ request: request, transactionHash: receipt.transactionHash});
                            }).catch(e => {return promiEvent.reject(e)});
                        }
                    },
                    (error: Error) => {
                        return promiEvent.reject(error);
                    },
                    _options);
            }).catch(e => {return promiEvent.reject(e)});
        });

        return promiEvent.eventEmitter;
    }

    /**
     * alias of requestCoreServices.getRequest()
     */
    public getRequest(_requestId: string): Promise < any > {
        return this.requestCoreServices.getRequest(_requestId);
    }

    /**
     * Get info from extension contract (generic method)
     * @param   _requestId    requestId of the request
     * @return  promise of the object containing the information from the extension contract of the request
     */
    public getRequestExtensionInfo(_requestId: string): Promise < any > {
        
        return new Promise((resolve, reject) => {
            if (!this.web3Single.isHexStrictBytes32(_requestId)) return reject(Error('_requestId must be a 32 bytes hex string (eg.: \'0x0000000000000000000000000000000000000000000000000000000000000000\''));

            this.instanceSynchroneExtensionEscrow.methods.escrows(_requestId).call((err: Error, data: any) => {
                if (err) return reject(err);

                let dataResult: any = {
                    currencyContract: data.currencyContract,
                    escrow: data.escrow,
                    state: data.state,
                    balance: new BN(data.balance)
                };

                return resolve(dataResult);
            });
        });
    }

    /**
     * alias of requestCoreServices.getRequestEvents()
     */
    public getRequestEvents(
        _requestId: string,
        _fromBlock ?: number,
        _toBlock ?: number): Promise < any > {
        return this.requestCoreServices.getRequestEvents(_requestId,_fromBlock,_toBlock);
    } 

    /**
     * Get request events from extension contract (generic method)
     * @param   _requestId    requestId of the request
     * @param   _fromBlock    search events from this block (optional)
     * @param   _toBlock        search events until this block (optional)
     * @return  promise of the object containing the events from the extension contract of the request (always {} here)
     */     
    public getRequestEventsExtensionInfo(
        _requestId: string,
        _fromBlock ?: number,
        _toBlock ?: number): Promise < any > {
        return new Promise(async (resolve, reject) => {
            // let events = await this.instanceSynchroneExtensionEscrow.getPastEvents('allEvents', {
            //     // allEvents and filter don't work together so far. issues created on web3 github
            //     // filter: {requestId: _requestId}, 
            //     fromBlock: requestSynchroneExtensionEscrow_Artifact.networks[this.web3Single.networkName].blockNumber,
            //     toBlock: 'latest'
            // });

            // TODO : events by event waiting for a patch of web3
            let optionFilters = {
                filter: { requestId: _requestId }, 
                fromBlock: requestSynchroneExtensionEscrow_Artifact.networks[this.web3Single.networkName].blockNumber,
                toBlock: 'latest'
            };

            let events = [];
            events = events.concat(await this.instanceSynchroneExtensionEscrow.getPastEvents('EscrowPayment', optionFilters));
            events = events.concat(await this.instanceSynchroneExtensionEscrow.getPastEvents('EscrowReleaseRequest', optionFilters));
            events = events.concat(await this.instanceSynchroneExtensionEscrow.getPastEvents('EscrowRefundRequest', optionFilters));

            return resolve(await Promise.all(events.map(async e => { 
                                                    return new Promise(async (resolve, reject) => {
                                                        resolve({
                                                            _meta: {
                                                                logIndex:e.logIndex,
                                                                blockNumber:e.blockNumber,
                                                                timestamp:await this.web3Single.getBlockTimestamp(e.blockNumber)
                                                            },
                                                            name:e.event,
                                                            data: e.returnValues
                                                        });
                                                    });
                                                })));
        });  
    }  
}