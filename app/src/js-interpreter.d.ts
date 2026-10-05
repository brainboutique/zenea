declare module 'js-interpreter' {
  class Interpreter {
    constructor(code: string, initFunc?: (interpreter: Interpreter, globalObject: object) => void);
    run(): void;
    appendCode(code: string): void;
    getStatus(): string;
    getGlobalScope(): object;
    setGlobalScope(scope: object): void;
    setProperty(obj: object, name: string, value: unknown, descriptor?: object): void;
    getProperty(obj: object, name: string): unknown;
    hasProperty(obj: object, name: string): boolean;
    createObject(proto?: object): object;
    createArray(): object;
    createNativeFunction(func: Function, constructor?: boolean): object;
    createAsyncFunction(func: Function): object;
    nativeToPseudo(native: unknown): unknown;
    pseudoToNative(pseudo: unknown): unknown;
    getValueFromScope(name: string): unknown;
    setValueToScope(name: string, value: unknown): void;
    getStateStack(): unknown[];
    setStateStack(stack: unknown[]): void;
    throwException(error: unknown, message?: string): void;
  }
  export default Interpreter;
}
