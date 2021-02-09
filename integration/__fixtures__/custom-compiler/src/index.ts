import { keys } from "ts-transformer-keys";

interface Props {
  id: string;
  name: string;
  age: number;
}
const keysOfProps = keys<Props>();

console.log(keysOfProps);
