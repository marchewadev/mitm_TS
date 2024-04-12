import puppeteer, { Page } from "puppeteer";
import { MessageData } from "../interfaces/MessageData";

export class Stranger {
  // The user's name is only used for user identification purposes to determine which user has disconnected or sent a message.
  // It does not influence the functionality of the app in any way.
  name: string;
  private pageWindow!: Page;
  private subscribers: Map<string, Function>;
  private messages: Array<{ message: string | null; sentAt: number }>;
  private websiteURL: string;
  private isCaptchaResolved: boolean;
  private isConnectedToChatRoom: boolean;
  private isStrangerConnected: boolean;

  constructor(name: string) {
    this.name = name;
    this.subscribers = new Map();
    this.websiteURL = "https://6obcy.org/rozmowa";
    this.isCaptchaResolved = false;
    this.isConnectedToChatRoom = false;
    this.isStrangerConnected = false;
    this.messages = [];
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async resolveCaptcha() {
    // Function that waits for the captcha frame to appear and then wait for user to solve it.
    // NOTE:
    // Unfortunately, the captcha is too difficult to solve for a bot, so it has to be solved manually (maybe in the future I will train an AI to solve captchas).

    const isCaptchaFrameVisible = await this.pageWindow.waitForSelector(
      ".sd-unit",
      {
        visible: true,
        timeout: 0,
      }
    );

    if (isCaptchaFrameVisible) {
      const isCaptchaResolved = await this.pageWindow.waitForFunction(
        "document.querySelector('.sd-unit') === null"
      );

      if (isCaptchaResolved) this.isCaptchaResolved = true;
    }
  }

  private subscribeToEvent(eventName: string, callback: Function) {
    // Method that allows subscribing to events.
    this.subscribers.set(eventName, callback);
  }

  private notifySubscribers(eventName: string, message?: string) {
    // Method that notifies subscribers about events.
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

  private async sendMessage(message: string) {
    // Method that sends a message to the chat room.
    if (this.isConnectedToChatRoom) {
      try {
        const textarea = await this.pageWindow.$("#box-interface-input");
        await textarea?.type(message, { delay: 1 });

        const sendButton = await this.pageWindow.$(".o-send.enabled");
        await sendButton?.click();
      } catch (e) {
        return;
      }
    }
  }

  private async getMessageFromChatRoom() {
    // Method that retrieves the latest message from the chat room.

    // Get all message elements and select the last one.
    const messageElements = await this.pageWindow.$$(
      ".log-stranger span.log-msg-text"
    );
    const messageElement = messageElements[messageElements.length - 1];

    if (messageElement) {
      const messageData = (await this.pageWindow.evaluate((element) => {
        const parentElement = element.closest(".inner.tipsy-active");

        const dataTipsyTime = Number(
          parentElement?.getAttribute("data-tipsy-time")
        );

        return { message: element.textContent, sentAt: dataTipsyTime };
      }, messageElement)) as MessageData;

      const lastMessage = this.messages[this.messages.length - 1];

      if (!lastMessage) {
        // If there are no messages in chat room yet, add the message to the messages array.
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

  private async disconnectFromChatRoom() {
    // Method that disconnects from the chat room.
    try {
      if (this.isStrangerConnected) {
        await this.pageWindow.waitForSelector(".o-new-talk", {
          visible: true,
          timeout: 0,
        });

        const disconnectButton = await this.pageWindow.$(".o-new-talk");

        await this.sleep(5000);
        disconnectButton?.click();
        this.isConnectedToChatRoom = false;
        this.isStrangerConnected = false;
      } else {
        const disconnectButton = await this.pageWindow.$(".o-esc");

        disconnectButton?.click({ count: 3, delay: 5 });
        this.isConnectedToChatRoom = false;
        this.isStrangerConnected = false;
      }
    } catch (e) {
      return;
    }
  }

  private async connectToChatRoom() {
    while (true) {
      const isChatting = await this.pageWindow.waitForSelector(
        ".o-send.enabled",
        {
          timeout: 0,
        }
      );

      if (isChatting) {
        this.isConnectedToChatRoom = true;
        this.isStrangerConnected = true;

        while (this.isConnectedToChatRoom) {
          try {
            await this.getMessageFromChatRoom();

            // Check if the chat has ended and do this every second.
            const isChatEnded = await this.pageWindow.waitForSelector(
              ".o-send.disabled",
              {
                timeout: 1000,
              }
            );

            if (isChatEnded && this.isConnectedToChatRoom) {
              this.notifySubscribers("disconnect");
              await this.disconnectFromChatRoom();
              break;
            }
          } catch (e) {
            if ((e as Error).name === "TimeoutError") {
              continue;
            } else {
              throw new Error((e as Error).message);
            }
          }
        }
      }
    }
  }

  async createNewSession(subscriber: Stranger) {
    const browser = await puppeteer.launch({
      defaultViewport: { width: 1280, height: 800 },
      args: ["--window-size=1280,1000"],
      headless: false,
      product: "firefox",
      protocol: "webDriverBiDi",
    });

    // Create a new page and navigate to the 6obcy website.
    this.pageWindow = await browser.newPage();
    await this.pageWindow.goto(this.websiteURL);

    // Wait for the cookie consent button to appear and click it.
    await this.pageWindow.waitForSelector(".fc-consent-root");
    const personalDataButton = await this.pageWindow.$(".fc-primary-button");
    await personalDataButton?.click();

    // Subscribe to events and pass the appropriate callbacks.
    this.subscribeToEvent("message", async (message: string) => {
      await subscriber.sendMessage(message);
    });

    this.subscribeToEvent("disconnect", async () => {
      await this.sleep(3500);
      await subscriber.disconnectFromChatRoom();
    });

    // Wait for the captcha to be resolved.
    await this.resolveCaptcha();
    if (!this.isCaptchaResolved) return;

    // Finally, connect to the chat room.
    await this.connectToChatRoom();
  }
}
