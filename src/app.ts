import { Stranger } from "./models/userModel";

const firstUser = new Stranger("Stachu");
const secondUser = new Stranger("Bolek");

(async () => {
  firstUser.createNewSession(secondUser);
  secondUser.createNewSession(firstUser);
})();
