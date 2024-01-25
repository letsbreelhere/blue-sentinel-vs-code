class Logger {
  static log(...messages: any[]) {
    console.log("[blue-sentinel]", ...messages);
  }
}

export default Logger;