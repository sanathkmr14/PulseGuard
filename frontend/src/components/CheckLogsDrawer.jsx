import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';

const CheckLogsDrawer = ({ isOpen, onClose, logs, monitorName }) => {
    return (
        <Transition.Root show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <div className="fixed inset-0" />

                <div className="fixed inset-0 overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden">
                        <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                            <Transition.Child
                                as={Fragment}
                                enter="transform transition ease-in-out duration-500 sm:duration-700"
                                enterFrom="translate-x-full"
                                enterTo="translate-x-0"
                                leave="transform transition ease-in-out duration-500 sm:duration-700"
                                leaveFrom="translate-x-0"
                                leaveTo="translate-x-full"
                            >
                                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                                    <div className="flex h-full flex-col overflow-y-scroll bg-slate-900 border-l border-slate-800 shadow-xl">
                                        <div className="bg-slate-800 py-6 px-4 sm:px-6">
                                            <div className="flex items-center justify-between">
                                                <Dialog.Title className="text-lg font-medium text-white">
                                                    Check Logs
                                                </Dialog.Title>
                                                <div className="ml-3 flex h-7 items-center">
                                                    <button
                                                        type="button"
                                                        className="rounded-md bg-slate-800 text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        onClick={onClose}
                                                    >
                                                        <span className="sr-only">Close panel</span>
                                                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-1">
                                                <p className="text-sm text-slate-400">
                                                    Recent checks for {monitorName}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="relative mt-6 flex-1 px-4 sm:px-6">
                                            <div className="flow-root">
                                                <ul role="list" className="-mb-8">
                                                    {logs.length === 0 ? (
                                                        <li className="text-slate-500 text-center py-4">No logs available</li>
                                                    ) : (
                                                        logs.map((log, logIdx) => (
                                                            <li key={log._id || logIdx}>
                                                                <div className="relative pb-8">
                                                                    {logIdx !== logs.length - 1 ? (
                                                                        <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-800" aria-hidden="true" />
                                                                    ) : null}
                                                                    <div className="relative flex space-x-3">
                                                                        <div>
                                                                            <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-slate-900 ${log.status === 'up' ? 'bg-emerald-500' :
                                                                                    log.status === 'degraded' ? 'bg-amber-500' :
                                                                                        'bg-red-500'
                                                                                }`}>
                                                                                {log.status === 'up' ? (
                                                                                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                                    </svg>
                                                                                ) : log.status === 'degraded' ? (
                                                                                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                                                                    </svg>
                                                                                ) : (
                                                                                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                                                    </svg>
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                                                                            <div>
                                                                                <p className="text-sm text-slate-300 font-medium capitalize">
                                                                                    {log.status}
                                                                                    {log.statusCode && <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-slate-800 text-slate-400 font-mono">{log.statusCode}</span>}
                                                                                </p>
                                                                                {(log.errorMessage || log.errorType) && (
                                                                                    <div className="mt-1">
                                                                                        {log.errorType && (
                                                                                            <span className="text-xs text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 mr-2">
                                                                                                {log.errorType}
                                                                                            </span>
                                                                                        )}
                                                                                        <p className="text-xs text-slate-400 mt-1 break-all">
                                                                                            {log.errorMessage}
                                                                                        </p>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="whitespace-nowrap text-right text-sm text-slate-500">
                                                                                <time dateTime={log.timestamp}>{new Date(log.timestamp).toLocaleTimeString()}</time>
                                                                                <div className="text-xs text-slate-600 font-mono mt-0.5">
                                                                                    {log.responseTime}ms
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </li>
                                                        ))
                                                    )}
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </Dialog.Panel>
                            </Transition.Child>
                        </div>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    );
};

export default CheckLogsDrawer;
