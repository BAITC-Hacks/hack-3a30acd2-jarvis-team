import { Editor } from "@/components/editor";
export default async function EditChallenge({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Editor key={id} id={id}/>;}
