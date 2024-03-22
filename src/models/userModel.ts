import puppeteer, { Page } from "puppeteer";

export class Stranger {
  // The user's name serves as the sole identifier for the individual utilizing the app, intended solely for user-friendliness.
  name: string;
  url: string;
  pageTest: any;
  private captchaResolved: boolean;
  private isConnectedToChatRoom: boolean;
  private messages: Array<{ message: string | null; sentAt: number }>;
  private subscribers: Map<string, Function>;

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
    this.subscribers = new Map();
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
      const isCaptchaResolved = await page.waitForFunction(
        "document.querySelector('.sd-unit') === null"
      );

      if (isCaptchaResolved) {
        this.captchaResolved = true;
      }
    }
  }

  async disconnectFromChatRoom(page: Page): Promise<any> {
    console.log(`${this.name} się rozłączył.`);
    console.log("-----------------------\n");

    await page.waitForSelector(".o-new-talk", {
      visible: true,
      timeout: 0,
    });

    try {
      const disconnectButton = await page.$(".o-new-talk");

      await this.sleep(2000);
      disconnectButton?.click();
      this.isConnectedToChatRoom = false;
    } catch (err) {
      return;
    }
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

        this.notifySubscribers("message", messageData.message);
      } else {
        if (messageData.sentAt > lastMessage.sentAt) {
          this.messages.push(messageData);
          console.log(`${this.name}: ${messageData.message}`);

          this.notifySubscribers("message", messageData.message);
        }
      }
    }
  }

  async connectToChatRoom(page: Page): Promise<any> {
    while (true) {
      const isChatting = await page.waitForSelector(".o-send.enabled", {
        timeout: 0,
      });

      if (isChatting) {
        this.isConnectedToChatRoom = true;

        while (this.isConnectedToChatRoom) {
          await this.getMessageFromChatRoom(page);

          try {
            const isChatEnded = await page.waitForSelector(".o-send.disabled", {
              timeout: 1000,
            });

            if (isChatEnded && this.isConnectedToChatRoom) {
              this.notifySubscribers("disconnect");
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

  subscribe(eventName: string, callback: Function): void {
    this.subscribers.set(eventName, callback);
  }

  private notifySubscribers(eventName: string, message?: string | null): void {
    this.subscribers.forEach((callback, event) => {
      if (event === eventName) {
        if (message) {
          callback(message);
        } else {
          callback();
        }
      }
    });
  }

  async disconnect() {
    try {
      const disconnectButton = await this.pageTest.$(".o-esc");

      disconnectButton?.click({ count: 3, delay: 5 });
      this.isConnectedToChatRoom = false;
    } catch (err) {
      return;
    }
  }

  async sendMessage(msg: string) {
    if (this.isConnectedToChatRoom) {
      try {
        const textarea = await this.pageTest.$("#box-interface-input");
        await textarea?.type(msg, { delay: 1 });

        const sendButton = await this.pageTest.$(".o-send.enabled");
        await sendButton?.click();
      } catch (error) {
        return;
      }
    }
  }

  async createNewSession(subscriber: any): Promise<void> {
    const browser = await puppeteer.launch({
      defaultViewport: { width: 1280, height: 800 },
      args: ["--window-size=1280,1000"],
      headless: false,
      product: "firefox",
      protocol: "webDriverBiDi",
    });

    const page = await browser.newPage();

    this.pageTest = page;

    await page.goto(this.url);

    await page.waitForSelector(".fc-consent-root");
    const personalDataButton = await page.$(".fc-primary-button");
    await personalDataButton?.click();

    this.subscribe("disconnect", async () => {
      await this.sleep(3500);
      await subscriber.disconnect();
    });

    this.subscribe("message", async (msg: string) => {
      await subscriber.sendMessage(msg);
    });

    await this.resolveCaptcha(page);

    if (!this.captchaResolved) return;

    await this.connectToChatRoom(page);
  }
}
