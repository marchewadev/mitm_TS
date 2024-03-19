import puppeteer, { Page } from "puppeteer";

export class Stranger {
  // The user's name serves as the sole identifier for the individual utilizing the app, intended solely for user-friendliness.
  name: string;
  url: string;
  private captchaResolved: boolean;
  private isConnectedToChatRoom: boolean;
  private messages: Array<{ message: string | null; sentAt: number }>;

  constructor(
    name: string,
    url: string = "https://6obcy.org/rozmowa",
    captchaResolved: boolean = false,
    isConnectedToChatRoom: boolean = false,
    messages: Array<{ message: string | null; sentAt: number }> = []
  ) {
    this.name = name;
    this.url = url;
    this.captchaResolved = captchaResolved;
    this.isConnectedToChatRoom = isConnectedToChatRoom;
    this.messages = messages;
  }

  async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async resolveCaptcha(page: Page): Promise<void> {
    const isCaptchaFrameVisible = await page.waitForSelector(".sd-unit", {
      visible: true,
      timeout: 0,
    });

    if (isCaptchaFrameVisible) {
      console.log("Rozwiąż captchę.");
      const isCaptchaResolved = await page.waitForFunction(
        "document.querySelector('.sd-unit') === null"
      );

      if (isCaptchaResolved) {
        this.captchaResolved = true;
        console.log("Captcha rozwiązana.\n");
      }
    }
  }

  async disconnectFromChatRoom(page: Page): Promise<any> {
    console.log("Rozmówca się rozłączył.");
    console.log("-----------------------\n");

    await page.waitForSelector(".o-new-talk", {
      visible: true,
      timeout: 0,
    });

    const disconnectButton = await page.$(".o-new-talk");

    await this.sleep(2000);
    disconnectButton?.click();
    this.isConnectedToChatRoom = false;

    return;
  }

  async getMessageFromChatRoom(page: Page): Promise<any> {
    const messageElements = await page.$$(".log-stranger span.log-msg-text");
    const messageElement = messageElements[messageElements.length - 1];

    if (messageElement) {
      const messageData = await page.evaluate((el) => {
        const parent = el.closest(".inner.tipsy-active");

        const dataTipsyTime = Number(parent?.getAttribute("data-tipsy-time"));

        return { message: el.textContent, sentAt: dataTipsyTime };
      }, messageElement);

      const lastMessage = this.messages[this.messages.length - 1];

      if (!lastMessage) {
        this.messages.push(messageData);
        console.log(`${this.name}: ${messageData.message}`);
      } else {
        if (messageData.sentAt > lastMessage.sentAt) {
          this.messages.push(messageData);
          console.log(`${this.name}: ${messageData.message}`);
        }
      }

      return;
    }
  }

  async connectToChatRoom(page: Page): Promise<any> {
    while (true) {
      const isChatting = await page.waitForSelector(".o-send.enabled", {
        timeout: 0,
      });

      if (isChatting) {
        this.isConnectedToChatRoom = true;
        console.log("Połączono z rozmówcą.");
        console.log("---------------------\n");

        while (this.isConnectedToChatRoom) {
          await this.getMessageFromChatRoom(page);

          try {
            const isChatEnded = await page.waitForSelector(".o-send.disabled", {
              timeout: 1000,
            });

            if (isChatEnded && this.isConnectedToChatRoom) {
              await this.disconnectFromChatRoom(page);
              break;
            }
          } catch (error: any) {
            if (error.name === "TimeoutError") {
              continue;
            } else {
              throw new Error(error);
            }
          }
        }
      }
    }
  }

  async createNewSession(): Promise<void> {
    const browser = await puppeteer.launch({ headless: false });

    const page = await browser.newPage();
    await page.goto(this.url);

    await page.waitForSelector(".fc-consent-root");
    const personalDataButton = await page.$(".fc-primary-button");
    await personalDataButton?.click();

    // TODO: At this point, a captcha appears. I think training AI to solve captchas, possibly using Python, would be a good solution. For now, the captcha needs to be transcribed manually.
    // TODO: Honestly, this is one of the hardest captchas to solve, or maybe I'm just too dumb.

    await this.resolveCaptcha(page);

    if (!this.captchaResolved) return;

    await this.connectToChatRoom(page);
  }
}
