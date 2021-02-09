import { keys } from "ts-transformer-keys";
import print from "./print";

interface Props {
  id: string;
  name: string;
  age: number;
}
const keysOfProps = keys<Props>();

print(keysOfProps);
