import { Stranger } from "./models/strangerModel";

const firstUser = new Stranger("Stachu");
const secondUser = new Stranger("Bolek");

(async () => {
  firstUser.createNewSession(secondUser);
  secondUser.createNewSession(firstUser);
})();
