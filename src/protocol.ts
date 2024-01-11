export type ProtocolMessage = 'MSG_TEXT' | 'MSG_AVAILABLE' | 'MSG_REQUEST' | 'MSG_INITIAL' | 'MSG_INFO' | 'MSG_CONNECT' | 'MSG_DISCONNECT';

const MESSAGE_TYPES: Record<ProtocolMessage, number> = {
  MSG_TEXT: 1,
  MSG_AVAILABLE: 2,
  MSG_REQUEST: 3,
  MSG_INFO: 5,
  MSG_INITIAL: 6,
  MSG_CONNECT: 7,
  MSG_DISCONNECT: 8,
};

const REVERSE_MESSAGE_TYPES: Record<string, ProtocolMessage> = Object.entries(MESSAGE_TYPES).reduce((acc, [key, value]) => {
  return { ...acc, [value]: key };
}, {});

export function messageEnum(message: ProtocolMessage): number {
  return MESSAGE_TYPES[message];
}

export function messageTypeFromEnum(messageType: number): ProtocolMessage | undefined {
  return REVERSE_MESSAGE_TYPES[messageType.toString()];
}

export const VSCODE_AGENT = 1;

/*
    An operation can be an character insert operation.

    [
      OP_INS, // operation type [integer]
      c, // character to insert [string]
      new_pid, // pid of inserted character [pid]
    ]

    An operation can be an character delete operation.

    [
      OP_DEL, // operation type [integer]
      c, // character to delete [string]
      del_pid, // pid of character to delete [pid]
    ]
*/

const OP_INS = 2;
const OP_DEL = 1;

export function operationEnum(operation: 'OP_INS' | 'OP_DEL'): number {
  return operation === 'OP_INS' ? OP_INS : OP_DEL;
}

export type ProtocolOperation = ['OP_INS', string, number] | ['OP_DEL', string, number];