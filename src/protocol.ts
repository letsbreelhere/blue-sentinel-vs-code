import * as jsonschema from 'jsonschema';

export type ProtocolMessage = 'MSG_TEXT' | 'MSG_AVAILABLE' | 'MSG_REQUEST' | 'MSG_INITIAL' | 'MSG_INFO' | 'MSG_CONNECT' | 'MSG_DISCONNECT' | 'MSG_MARK';

export const MessageTypes = {
  MSG_TEXT: 1,
  MSG_AVAILABLE: 2,
  MSG_REQUEST: 3,
  MSG_INFO: 5,
  MSG_INITIAL: 6,
  MSG_CONNECT: 7,
  MSG_DISCONNECT: 8,
  MSG_MARK: 10
};

export const VSCODE_AGENT = 1;

export const OP_INS = 2;
export const OP_DEL = 1;
type Operation = typeof OP_INS | typeof OP_DEL;

const Schema = require('../protocol.schema.json');
export function isMessageValid(message: any): boolean {
  const validator = new jsonschema.Validator();
  return validator.validate(message, Schema).valid;
};

export class ProtocolError extends Error {
  message: any;
  validationErrors: jsonschema.ValidationError[];

  constructor(message: any, errors: jsonschema.ValidationError[]) {
    super();
    let stringified;
    try {
      stringified = JSON.stringify(message);
    } catch (e) {
      stringified = message;
    }
    this.message = `Invalid message\n${stringified}: ${JSON.stringify(errors)}`;
    this.validationErrors = errors;
  }
}

export function isValidMessage(message: any): boolean {
  const validator = new jsonschema.Validator();
  const result = validator.validate(message, Schema);
  return result.valid;
}

export function validateMessage(message: any): void {
  const validator = new jsonschema.Validator();
  const result = validator.validate(message, Schema);
  if (!result.valid) {
    throw new ProtocolError(message, result.errors);
  }
}