class Logger {
  static log(...messages: any[]) {
    console.log("[instant-code]", ...messages);
  }
}

export default Logger;