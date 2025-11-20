import chalk from 'chalk';

class Logger {
  constructor(verbose = false) {
    this.verbose = verbose;
  }

  info(message) {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message) {
    console.log(chalk.green('✓'), message);
  }

  error(message) {
    console.error(chalk.red('✗'), message);
  }

  warning(message) {
    console.log(chalk.yellow('⚠'), message);
  }

  debug(message) {
    if (this.verbose) {
      console.log(chalk.gray('🔍'), message);
    }
  }

  step(step, total, message) {
    console.log(chalk.cyan(`[${step}/${total}]`), message);
  }
}

export default new Logger();
