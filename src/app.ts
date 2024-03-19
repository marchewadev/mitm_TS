import { Stranger } from "./models/userModel";

const firstUser = new Stranger("Stachu");
// const secondUser = new Stranger("Krzychu");

(async () => {
  await firstUser.createNewSession();
})();
