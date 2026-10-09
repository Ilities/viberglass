/**
 * Stands in for the chat SDK and its Slack adapter, which are ESM-only and
 * don't load under Jest. Loading the integration registry imports them through
 * the Slack plugin; tests of chat behaviour mock what they need themselves.
 */
const element = (props: unknown) => ({ props });

export const Card = element;
export const CardText = element;
export const Actions = element;
export const Button = element;
export const Modal = element;
export const Select = element;
export const SelectOption = element;
export const TextInput = element;
export class ThreadImpl {}
export class Chat {}
export const createSlackAdapter = () => ({});
export const createPostgresState = () => ({});
